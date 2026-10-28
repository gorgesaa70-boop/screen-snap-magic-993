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

/**
 * A listing's owner (broker / company / developer) answers a chat the bot handed to them (release 39). The message
 * leaves from the Value Aqar number with the owner's name on top; the owner never sees the customer's number and
 * can't send one of their own.
 */
export const replyAsOwner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), body: z.string().trim().min(1).max(2000) }).parse(d))
  .handler(async ({ data, context }) => {
    const { contactLeak, ownerReplyText } = await import("@/lib/wa-owner");
    if (contactLeak(data.body)) return { ok: false as const, error: "ممنوع أرقام التليفونات أو لينكات الواتساب أو الإيميل في الرد. التواصل مع العميل بيكون من خلال المنصة." };
    const me = await (context as Ctx).supabase.rpc("current_broker_id");
    if (me.error || !me.data) throw new Error("غير مصرح لك بهذا الإجراء");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    const { data: conv } = await db.from("wa_conversations").select("phone, last_inbound_at, owner_broker_id, owner_replied_at").eq("id", data.id).maybeSingle();
    if (!conv || conv.owner_broker_id !== me.data) return { ok: false as const, error: "المحادثة دي مش معاك دلوقتي." };
    if (!conv.last_inbound_at || Date.now() - new Date(conv.last_inbound_at).getTime() > 24 * 3_600_000)
      return { ok: false as const, error: "عدّى أكتر من 24 ساعة من آخر رسالة من العميل، فواتساب مش هيسمح برسالة. استنى لما يبعت تاني." };
    const { data: broker } = await db.from("brokers").select("name").eq("id", me.data).maybeSingle();
    const { sendAndRecord } = await import("@/lib/whatsapp-bot.server");
    const r = await sendAndRecord(supabaseAdmin, conv.phone, ownerReplyText(broker?.name ?? "صاحب الإعلان", data.body), "owner", (context as Ctx).userId);
    if (!r.ok) return { ok: false as const, error: `الرسالة ماتبعتتش (${r.error}).` };
    // The owner is on it: the bot stays quiet, and the chat counts as read for them.
    await db.from("wa_conversations").update({
      bot_paused_until: new Date(Date.now() + STAFF_PAUSE_MS).toISOString(), owner_unread: 0,
      ...(conv.owner_replied_at ? {} : { owner_replied_at: new Date().toISOString() }),
    }).eq("phone", conv.phone);
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
