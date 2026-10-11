import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: any; userId: string };

async function assertAdmin(context: Ctx) {
  const { data, error } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (error || !data) throw new Error("غير مصرح لك بهذا الإجراء");
}

const createSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(255),
  mode: z.enum(["invite", "password"]),
  password: z.string().min(8).max(72).optional(),
  phone: z.string().trim().max(20).optional(),
  specialty: z.string().trim().max(120).optional(),
  areas: z.array(z.string().max(60)).max(20).default([]),
  planId: z.string().uuid().optional(),
  redirectTo: z.string().url(),
});

export const createBrokerAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as Ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let userId: string;
    if (data.mode === "invite") {
      const { data: inv, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(data.email, { redirectTo: data.redirectTo });
      if (error) return { ok: false as const, error: error.message };
      userId = inv.user.id;
    } else {
      if (!data.password) return { ok: false as const, error: "كلمة المرور مطلوبة" };
      const { data: cu, error } = await supabaseAdmin.auth.admin.createUser({ email: data.email, password: data.password, email_confirm: true });
      if (error) return { ok: false as const, error: error.message };
      userId = cu.user.id;
    }

    await supabaseAdmin.from("user_roles").insert({ user_id: userId, role: "broker" });
    let planId = data.planId;
    if (!planId) {
      const { data: free } = await supabaseAdmin.from("plans").select("id").eq("code", "free").maybeSingle();
      planId = free?.id;
    }
    const { error: be } = await supabaseAdmin.from("brokers").insert({
      user_id: userId,
      slug: `b-${crypto.randomUUID().slice(0, 8)}`,
      name: data.name,
      email: data.email,
      phone: data.phone || null,
      whatsapp: data.phone || null,
      specialty: data.specialty || null,
      areas: data.areas,
      plan_id: planId ?? null,
    });
    if (be) return { ok: false as const, error: be.message };
    return { ok: true as const };
  });

export const setBrokerActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ brokerId: z.string().uuid(), active: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as Ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: b, error } = await supabaseAdmin.from("brokers").update({ is_active: data.active, suspended_at: data.active ? null : new Date().toISOString() }).eq("id", data.brokerId).select("user_id").single();
    if (error) return { ok: false as const, error: error.message };
    if (b.user_id) {
      if (data.active) await supabaseAdmin.from("user_roles").upsert({ user_id: b.user_id, role: "broker" }, { onConflict: "user_id,role" });
      await supabaseAdmin.auth.admin.updateUserById(b.user_id, { ban_duration: data.active ? "none" : "876000h" });
    }
    return { ok: true as const };
  });

/** Value Aqar staff are added by phone; they sign in with a WhatsApp code like everyone else. */
export const listStaff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as Ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roles, error } = await supabaseAdmin.from("user_roles").select("user_id").eq("role", "staff");
    if (error) return { ok: false as const, error: error.message };
    const staff = await Promise.all((roles ?? []).map(async ({ user_id }) => {
      const { data } = await supabaseAdmin.auth.admin.getUserById(user_id);
      return { userId: user_id, phone: data.user?.phone ?? "", name: (data.user?.user_metadata?.["full_name"] as string | undefined) ?? "" };
    }));
    return { ok: true as const, staff };
  });

export const addStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ name: z.string().trim().min(2).max(100), phone: z.string().trim().min(8).max(20) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as Ctx);
    const { normalizePhone } = await import("@/lib/broker-login");
    const phone = normalizePhone(data.phone);
    if (!phone || phone.length < 10) return { ok: false as const, error: "رقم الموبايل غير صحيح" };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: ids } = await supabaseAdmin.rpc("auth_user_ids_by_phone", { _phone: phone });
    const list = (ids ?? []) as string[];
    if (list.length > 1) return { ok: false as const, error: "الرقم ده مربوط بأكتر من حساب — راجعه الأول" };
    const { data: brokers } = await supabaseAdmin.rpc("brokers_by_phone", { _phone: phone });
    if ((brokers ?? []).length) return { ok: false as const, error: "الرقم ده مسجّل كحساب وسيط أو شركة" };
    let userId = list[0];
    if (!userId) {
      const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
        phone, phone_confirm: true, email: `wa-${phone}@phone.valueaqar.invalid`, email_confirm: true, user_metadata: { full_name: data.name },
      });
      if (error || !created.user) return { ok: false as const, error: error?.message ?? "تعذّر إنشاء الحساب" };
      userId = created.user.id;
    } else {
      await supabaseAdmin.auth.admin.updateUserById(userId, { user_metadata: { full_name: data.name } });
    }
    const { error } = await supabaseAdmin.from("user_roles").upsert({ user_id: userId, role: "staff" }, { onConflict: "user_id,role" });
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

export const removeStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as Ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId).eq("role", "staff");
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

/** Names of Value Aqar staff for the lead assignment menu (admins and staff only). */
export const staffDirectory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as Ctx;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: mine } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", ctx.userId);
    const roles = (mine ?? []).map((r) => r.role as string);
    if (!roles.includes("admin") && !roles.includes("staff")) return { ok: false as const, error: "غير مصرح لك بهذا الإجراء" };
    const { data: rows } = await supabaseAdmin.from("user_roles").select("user_id").eq("role", "staff");
    const staff = await Promise.all((rows ?? []).map(async ({ user_id }) => {
      const { data } = await supabaseAdmin.auth.admin.getUserById(user_id);
      return { userId: user_id, name: (data.user?.user_metadata?.["full_name"] as string | undefined) || (data.user?.phone ? `+${data.user.phone}` : "موظف") };
    }));
    return { ok: true as const, staff };
  });
