import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Team inbox actions (admin / staff only): reply to a customer from the API number, pause or resume the bot. */

type Ctx = { supabase: any; userId: string }; // eslint-disable-line @typescript-eslint/no-explicit-any

/** The admin, or an employee granted «محادثات الواتساب: يعدّل» (release 38). */
async function assertTeam(context: Ctx) {
  const can = await context.supabase.rpc("staff_can", { _section: "wa_inbox", _need: "edit" });
  if (!can.error) { if (!can.data) throw new Error("غير مصرح لك بهذا الإجراء"); return; }
  // Before release 38: admin only.
  const admin = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (!admin.data) throw new Error("غير مصرح لك بهذا الإجراء");
}

const phone = z.string().regex(/^[0-9]{8,15}$/);
const STAFF_PAUSE_MS = 12 * 3_600_000;

export const replyOnWhatsapp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ phone, body: z.string().trim().min(1).max(4000) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertTeam(context as Ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    const { data: conv } = await db.from("wa_conversations").select("last_inbound_at").eq("phone", data.phone).maybeSingle();
    if (!conv) return { ok: false as const, error: "المحادثة مش موجودة." };
    // Meta only allows free text within 24 hours of the customer's last message.
    if (!conv.last_inbound_at || Date.now() - new Date(conv.last_inbound_at).getTime() > 24 * 3_600_000)
      return { ok: false as const, error: "عدّى أكتر من 24 ساعة من آخر رسالة من العميل، فواتساب مش هيسمح برسالة عادية. كلّمه تليفون أو استنى لما يبعت تاني." };
    const { sendAndRecord } = await import("@/lib/whatsapp-bot.server");
    const r = await sendAndRecord(supabaseAdmin, data.phone, data.body, "staff", (context as Ctx).userId);
    if (!r.ok) return { ok: false as const, error: `الرسالة ماتبعتتش (${r.error}).` };
    // A person is handling the chat: the bot stays quiet for a while, and the chat counts as read.
    await db.from("wa_conversations").update({ bot_paused_until: new Date(Date.now() + STAFF_PAUSE_MS).toISOString(), unread: 0 }).eq("phone", data.phone);
    return { ok: true as const };
  });

export const setWhatsappBot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ phone, paused: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertTeam(context as Ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const until = data.paused ? new Date(Date.now() + 7 * 24 * 3_600_000).toISOString() : null;
    await (supabaseAdmin as any).from("wa_conversations").update({ bot_paused_until: until }).eq("phone", data.phone); // eslint-disable-line @typescript-eslint/no-explicit-any
    return { ok: true as const };
  });
