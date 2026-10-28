import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: any; userId: string };

async function assertAdmin(context: Ctx) {
  const { data, error } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (error || !data) throw new Error("غير مصرح لك بهذا الإجراء");
}

/** The admin, or an employee granted «يعدّل» on that section (release 38; admin only before it). Returns whether it's the admin. */
async function assertCan(context: Ctx, section: string): Promise<boolean> {
  const admin = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (admin.data) return true;
  const can = await context.supabase.rpc("staff_can", { _section: section, _need: "edit" });
  if (can.error || !can.data) throw new Error("غير مصرح لك بهذا الإجراء");
  return false;
}

/** Employees never block or delete the admin or other Value Aqar staff. */
async function assertNotTeam(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
  if ((data ?? []).some((r) => r.role === "admin" || r.role === "staff")) throw new Error("الحساب ده تبع فريق فاليو عقار، والأدمن بس يقدر يغيّره");
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
    await assertCan(context as Ctx, "brokers");
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
    await assertCan(context as Ctx, "brokers");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: b, error } = await supabaseAdmin.from("brokers").update({ is_active: data.active, suspended_at: data.active ? null : new Date().toISOString() }).eq("id", data.brokerId).select("user_id").single();
    if (error) return { ok: false as const, error: error.message };
    if (b.user_id) {
      if (data.active) await supabaseAdmin.from("user_roles").upsert({ user_id: b.user_id, role: "broker" }, { onConflict: "user_id,role" });
      await supabaseAdmin.auth.admin.updateUserById(b.user_id, { ban_duration: data.active ? "none" : "876000h" });
    }
    return { ok: true as const };
  });

/** Admin: stop or allow any login (brokers also go through setBrokerActive so their listings follow). Admins can't be stopped. */
export const setAccountBlocked = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ userId: z.string().uuid(), blocked: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    const callerIsAdmin = await assertCan(ctx, "accounts");
    if (data.userId === ctx.userId) return { ok: false as const, error: "مينفعش توقف حسابك" };
    if (!callerIsAdmin) await assertNotTeam(data.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: isAdmin } = await supabaseAdmin.rpc("has_role", { _user_id: data.userId, _role: "admin" });
    if (isAdmin) return { ok: false as const, error: "مينفعش توقف حساب أدمن" };
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, { ban_duration: data.blocked ? "876000h" : "none" });
    if (error) return { ok: false as const, error: error.message };
    await supabaseAdmin.from("brokers").update({ is_active: !data.blocked, suspended_at: data.blocked ? new Date().toISOString() : null }).eq("user_id", data.userId);
    return { ok: true as const };
  });

/**
 * Admin: delete any account except an admin's or their own. Data is cleared by prepare_account_deletion (listings with
 * customers / deals stay off the site for the records), then the login goes, so the same e-mail or phone can sign up again.
 */
export const deleteAccountAsAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    const isAdmin = await assertCan(ctx, "accounts");
    if (data.userId === ctx.userId) return { ok: false as const, error: "مينفعش تمسح حسابك من هنا" };
    if (!isAdmin) await assertNotTeam(data.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: r, error } = await supabaseAdmin.rpc("prepare_account_deletion", { _uid: data.userId, _by: ctx.userId });
    if (error) return { ok: false as const, error: error.message };
    if (r === "admin") return { ok: false as const, error: "مينفعش تمسح حساب أدمن — شيل صلاحية الأدمن الأول" };
    if (r !== "missing") {
      const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
      if (delErr) return { ok: false as const, error: delErr.message };
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
      const phone = data.user?.phone ?? "";
      // Also a broker / company (own account, or a team member of one)? The permissions screen warns about it.
      const [own, byPhone] = await Promise.all([
        supabaseAdmin.from("brokers").select("name").eq("user_id", user_id).limit(1),
        phone ? supabaseAdmin.rpc("brokers_by_phone", { _phone: phone }) : Promise.resolve({ data: [] as { id: string }[] }),
      ]);
      let brokerName: string | null = own.data?.[0]?.name ?? null;
      if (!brokerName && (byPhone.data ?? []).length) {
        const id = (byPhone.data as { id: string }[])[0]!.id;
        brokerName = (await supabaseAdmin.from("brokers").select("name").eq("id", id).maybeSingle()).data?.name ?? null;
      }
      return { userId: user_id, phone, name: (data.user?.user_metadata?.["full_name"] as string | undefined) ?? "", brokerName };
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
    // A broker / company on this number becomes an employee on the SAME account (both roles; the admin limits what
    // they see in «الصلاحيات», e.g. only their own customers).
    const { data: brokers } = await supabaseAdmin.rpc("brokers_by_phone", { _phone: phone });
    const owner = (brokers ?? []).find((b: { user_id: string | null }) => b.user_id)?.user_id ?? null;
    let userId = owner ?? list[0];
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
    // Their permissions go too, so re-adding the same person starts from nothing (release 38; harmless before it).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabaseAdmin as any).from("staff_permissions").delete().eq("user_id", data.userId);
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

/**
 * Item 37: full copy of the platform's data as JSON (admins only), downloaded from the admin panel.
 * Login codes (whatsapp_otps) are left out; photos and documents stay in storage and are not included.
 */
const BACKUP_TABLES = [
  "app_settings", "plans", "brokers", "company_members", "user_roles", "properties", "malls", "industrial_zones", "industrial_activities",
  "projects", "project_units", "project_unit_history", "leads", "lead_activities", "lead_assignments", "deals", "deal_documents",
  "company_agreements", "commissions", "commission_payments", "tasks", "routing_rules", "subscriptions", "investment_opportunities",
  "investment_requests", "investor_profiles", "favorites", "saved_searches", "notification_preferences", "notifications", "audit_log",
] as const;

export const exportBackup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertCan(context as Ctx, "health");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic table loop
    const db = supabaseAdmin as any;
    const tables: Record<string, unknown[]> = {};
    const missing: string[] = [];
    for (const name of BACKUP_TABLES) {
      const rows: unknown[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await db.from(name).select("*").range(from, from + 999);
        if (error) { missing.push(name); break; }
        rows.push(...(data ?? []));
        if (!data || data.length < 1000) break;
      }
      tables[name] = rows;
    }
    const at = new Date().toISOString();
    await supabaseAdmin.from("app_settings").update({ last_backup_at: at }).eq("id", 1);
    // Sent as text: the browser saves it as a file as-is.
    return { ok: true as const, at, missing, json: JSON.stringify({ generated_at: at, tables }) };
  });

/** Admin: tell Bing, Yandex and other IndexNow engines about new or changed public pages (Google reads the sitemap instead). */
export const notifySearchEngines = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertCan(context as Ctx, "health");
    const { sendIndexNow } = await import("@/lib/indexnow.server");
    return sendIndexNow();
  });

/** After the team approves a listing, project, compound or mall unit: the same send, at most once every 10 minutes. */
export const notifySearchEnginesSoon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as Ctx;
    const { data: staff } = await ctx.supabase.rpc("is_staff");
    if (!staff) return { ok: false, status: 0, count: 0, sentAt: null };
    const { sendIndexNow } = await import("@/lib/indexnow.server");
    return sendIndexNow({ minGapMs: 10 * 60_000 }).catch(() => ({ ok: false, status: 0, count: 0, sentAt: null }));
  });
