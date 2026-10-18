import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { sendWhatsappText } from "./whatsapp-send.server";
import { DEFAULT_HOURS } from "./response-time";
import type { AiResult } from "./whatsapp-ai.server";
import { REPLY, isGreetingOnly, isWorkTime, listingIds, listingNumbers, listingText, menuChoice, welcome, type ListingCard } from "./whatsapp-bot";

/**
 * Runs for every new customer message on the API number (after the sign-in check and the lead import):
 * keeps the team inbox (wa_conversations / wa_messages) and answers — listing codes, the menu, a hand-off to the team,
 * and AI answers from real listings. Staff replies pause the bot for that customer.
 */

type Db = SupabaseClient<Database>;
// The bot tables come from release 36; until the generated types include them, go through an untyped client.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const raw = (db: Db) => db as unknown as SupabaseClient<any>;

const HOUR = 3_600_000;
const BOT_PAUSE_AFTER_HANDOFF = 24 * HOUR;
const MAX_BOT_REPLIES_PER_HOUR = 15;

export type Inbound = { wa_message_id: string; phone: string; name: string | null; text: string | null };

/** Sends a message from the bot or a staff member and records it in the inbox. */
export async function sendAndRecord(db: Db, phone: string, body: string, sender: "bot" | "staff", staffId: string | null = null) {
  const r = await sendWhatsappText(phone, body);
  const now = new Date().toISOString();
  await raw(db).from("wa_messages").insert({
    phone, direction: "out", sender, staff_id: staffId, body: body.slice(0, 4000),
    wa_message_id: r.ok ? r.id : null, status: r.ok ? "sent" : r.error,
  });
  if (r.ok) await raw(db).from("wa_conversations").update({ last_outbound_at: now, last_message: body.slice(0, 200), updated_at: now }).eq("phone", phone);
  return r;
}

async function findListings(db: Db, numbers: number[], ids: string[]): Promise<ListingCard[]> {
  if (!numbers.length && !ids.length) return [];
  let q = db.from("properties").select("id, listing_no, type, status, city, area, size, rooms, price, availability").eq("review_status", "approved");
  q = numbers.length && ids.length ? q.or(`listing_no.in.(${numbers.join(",")}),id.in.(${ids.join(",")})`)
    : numbers.length ? q.in("listing_no", numbers) : q.in("id", ids);
  const { data } = await q.limit(3);
  return (data ?? []).map((r) => ({
    id: r.id, code: r.listing_no != null ? `VA-${r.listing_no}` : null, type: r.type, status: r.status, city: r.city, area: r.area,
    size: r.size != null ? Number(r.size) : null, rooms: r.rooms, price: r.price != null ? Number(r.price) : null,
    available: (r.availability ?? "available") === "available",
  }));
}

async function openLeadId(db: Db, phone: string) {
  const { data } = await db.from("leads").select("id").eq("phone_norm", phone).not("stage", "in", "(sold,lost)")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  return data?.id ?? null;
}

async function handoff(db: Db, m: Inbound, leadId: string | null, workTime: boolean, text?: string) {
  const until = new Date(Date.now() + BOT_PAUSE_AFTER_HANDOFF).toISOString();
  await raw(db).from("wa_conversations").update({ bot_paused_until: until, handoff_at: new Date().toISOString() }).eq("phone", m.phone);
  await sendAndRecord(db, m.phone, text || (workTime ? REPLY.human : REPLY.humanAfterHours), "bot");
  const who = m.name ? `${m.name} (+${m.phone})` : `+${m.phone}`;
  await raw(db).rpc("wa_notify_team", { _title: "عميل واتساب عاوز يكلم حد", _msg: `${who}: ${(m.text ?? "").slice(0, 140)}`, _phone: m.phone });
  if (leadId) await db.from("lead_activities").insert({ lead_id: leadId, actor_id: null, kind: "whatsapp", summary: "بوت الواتساب حوّل العميل للفريق (طلب يكلم حد)." });
}

export async function handleInbound(db: Db, m: Inbound, leadResult: string | null) {
  const now = new Date();
  const text = (m.text ?? "").trim();

  // 1) Inbox: conversation + the message itself.
  const { data: conv } = await raw(db).from("wa_conversations").select("*").eq("phone", m.phone).maybeSingle();
  const prevInbound = conv?.last_inbound_at ? new Date(conv.last_inbound_at as string).getTime() : 0;
  const leadId = await openLeadId(db, m.phone);
  const patch = {
    name: m.name ?? conv?.name ?? null, last_message: text.slice(0, 200), last_inbound_at: now.toISOString(),
    unread: (conv?.unread ?? 0) + 1, updated_at: now.toISOString(), ...(leadId ? { lead_id: leadId } : {}),
  };
  if (conv) await raw(db).from("wa_conversations").update(patch).eq("phone", m.phone);
  else await raw(db).from("wa_conversations").insert({ phone: m.phone, ...patch });
  const { error: msgErr } = await raw(db).from("wa_messages").insert({ phone: m.phone, direction: "in", sender: "customer", body: text.slice(0, 4000), wa_message_id: m.wa_message_id });
  if (msgErr) { if (msgErr.code !== "23505") console.error("wa inbox insert failed", msgErr.code); return; }

  // 2) Should the bot answer at all?
  if (leadResult === "team" || leadResult === "ignored") return;
  const { data: settings } = await raw(db).from("app_settings").select("wa_bot_enabled, wa_bot_ai, work_start_hour, work_end_hour").eq("id", 1).maybeSingle();
  if (settings && settings.wa_bot_enabled === false) return;
  const paused = conv?.bot_paused_until && new Date(conv.bot_paused_until as string) > now;
  if (paused) {
    // A staff member is handling this chat: only ping the team when a new unread message starts piling up.
    if (!conv?.unread) await raw(db).rpc("wa_notify_team", { _title: "رسالة واتساب جديدة", _msg: `${m.name ?? "+" + m.phone}: ${text.slice(0, 140)}`, _phone: m.phone });
    return;
  }
  const { count: recentBot } = await raw(db).from("wa_messages").select("id", { count: "exact", head: true })
    .eq("phone", m.phone).eq("sender", "bot").gt("created_at", new Date(now.getTime() - HOUR).toISOString());
  if ((recentBot ?? 0) >= MAX_BOT_REPLIES_PER_HOUR) return;

  const hours = settings?.work_start_hour != null ? { start: settings.work_start_hour as number, end: settings.work_end_hour as number } : DEFAULT_HOURS;
  const workTime = isWorkTime(hours, now);
  const firstToday = now.getTime() - prevInbound > 24 * HOUR;
  const isMedia = /^\([a-z_]+\)$/.test(text);

  // 3) A listing code or a listing link → its card(s).
  const numbers = listingNumbers(text), ids = listingIds(text);
  if (numbers.length || ids.length) {
    const found = await findListings(db, numbers, ids);
    const intro = firstToday ? `أهلاً${m.name ? ` ${m.name.split(/\s+/)[0]}` : ""} 👋 ده العقار اللي بتسأل عليه:\n\n` : "";
    const body = found.length ? `${intro}${found.map(listingText).join("\n\n")}\n\nلو حابب تعاين أو تعرف تفاصيل أكتر، اكتب 3 وحد من الفريق هيكلّمك.` : REPLY.notFound;
    await sendAndRecord(db, m.phone, body, "bot");
    if (leadId && found.length) await db.from("lead_activities").insert({ lead_id: leadId, actor_id: null, kind: "whatsapp", summary: `سأل على ${found.map((f) => f.code ?? f.id).join("، ")} (بوت الواتساب بعتله التفاصيل).` });
    return;
  }

  // 4) Menu choices.
  const choice = menuChoice(text);
  if (choice === "human") return handoff(db, m, leadId, workTime);
  if (choice === "sell") { await sendAndRecord(db, m.phone, REPLY.sell, "bot"); return; }
  if (choice === "search") { await sendAndRecord(db, m.phone, REPLY.search, "bot"); return; }

  // 5) Greeting / first message of the day → welcome + menu.
  if (isMedia || (firstToday && (isGreetingOnly(text) || text.length < 3))) {
    await sendAndRecord(db, m.phone, firstToday ? welcome(m.name) : REPLY.fallback, "bot");
    return;
  }
  if (isGreetingOnly(text)) { await sendAndRecord(db, m.phone, welcome(m.name), "bot"); return; }

  // 6) Free text → AI (when on and configured), else the fixed reply.
  if (settings?.wa_bot_ai !== false) {
    const { data: hist } = await raw(db).from("wa_messages").select("sender, body").eq("phone", m.phone).order("created_at", { ascending: false }).limit(12);
    const history = (hist ?? []).reverse().map((h: { sender: string; body: string }) => ({ role: h.sender === "customer" ? "user" as const : "model" as const, text: h.body }));
    const { aiReply } = await import("./whatsapp-ai.server");
    const ai = await aiReply(db, history).catch((e: Error) => { console.error("wa bot ai error", e.message); return null; });
    if (ai) {
      if (ai.handoff) return handoff(db, m, leadId, workTime, ai.text || undefined);
      const cards = ai.listings.length ? `\n\n${ai.listings.map(listingText).join("\n\n")}` : "";
      const body = `${ai.text || (ai.listings.length ? "دي أنسب حاجات لقيتها:" : REPLY.fallback)}${cards}`;
      await sendAndRecord(db, m.phone, body, "bot");
      if (leadId && Object.keys(ai.request).length) {
        const { data: lead } = await db.from("leads").select("purpose, property_type, area, budget").eq("id", leadId).maybeSingle();
        const fill = Object.fromEntries(Object.entries(ai.request).filter(([k]) => lead && (lead as Record<string, unknown>)[k] == null)) as AiResult["request"];
        if (Object.keys(fill).length) await db.from("leads").update(fill).eq("id", leadId);
        await db.from("lead_activities").insert({ lead_id: leadId, actor_id: null, kind: "whatsapp", summary: `طلب من بوت الواتساب: ${JSON.stringify(ai.request)}`.slice(0, 1000) });
      }
      return;
    }
  }
  // AI off / unavailable: welcome once a day, otherwise one "we got it" per 6 hours (no repeating ourselves).
  if (firstToday) { await sendAndRecord(db, m.phone, welcome(m.name), "bot"); return; }
  const lastOut = conv?.last_outbound_at ? new Date(conv.last_outbound_at as string).getTime() : 0;
  if (now.getTime() - lastOut > 6 * HOUR) await sendAndRecord(db, m.phone, REPLY.fallback, "bot");
}

/** Delivery receipts from Meta for messages in the inbox. */
export async function updateInboxStatus(db: Db, waMessageId: string, status: string) {
  await raw(db).from("wa_messages").update({ status }).eq("wa_message_id", waMessageId).or("status.is.null,status.neq.read");
}
