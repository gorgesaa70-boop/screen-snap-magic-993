/**
 * WhatsApp bot: reading a customer's message and the fixed replies. Pure functions (no network), so they are unit-tested;
 * the server side (whatsapp-bot.server.ts) decides when to send them.
 */
import { ARABIC_DIGITS, latinDigit } from "./digits";
import type { WorkHours } from "./response-time";

export const SITE = "https://valueaqar.com";

/** Arabic digits → 0-9, Arabic letter variants folded, lower case, single spaces. */
export function normalize(text: string) {
  return text.replace(ARABIC_DIGITS, latinDigit).replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي")
    .replace(/[ً-ْ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

/** Listing numbers the customer mentions: «VA-123», «va 123», «كود 123», or a site link copied from a card. */
export function listingNumbers(text: string): number[] {
  const t = normalize(text);
  const out = new Set<number>();
  for (const m of t.matchAll(/\bva\s*-?\s*(\d{1,7})\b/g)) out.add(Number(m[1]));
  for (const m of t.matchAll(/(?:كود|رقم الاعلان|رقم العقار)\s*:?\s*(\d{1,7})\b/g)) out.add(Number(m[1]));
  return [...out].slice(0, 3);
}

/** Property page ids from links like valueaqar.com/properties/<uuid> (the site's WhatsApp buttons send this). */
export function listingIds(text: string): string[] {
  return [...new Set([...text.matchAll(/properties\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi)].map((m) => m[1]!.toLowerCase()))].slice(0, 3);
}

export type MenuChoice = "search" | "sell" | "human";

/** The customer picked an item from the menu, by number or by words. */
export function menuChoice(text: string): MenuChoice | null {
  const t = normalize(text);
  if (/^[1١]\s*$/.test(t)) return "search";
  if (/^[2٢]\s*$/.test(t)) return "sell";
  if (/^[3٣]\s*$/.test(t)) return "human";
  if (/(كلم|اكلم|عايز اتكلم|عاوز اتكلم|موظف|خدمه العملاء|حد من الفريق|بني ادم|انسان|human|agent|call me|كلموني|اتصلوا)/.test(t)) return "human";
  if (/(اعرض عقاري|عاوز ابيع|عايز ابيع|ابيع شقتي|ابيع عقار|اعلن عن|عندي شقه للبيع|عندي عقار)/.test(t)) return "sell";
  return null;
}

/** «السلام عليكم» / «hi» alone, with nothing else to answer. */
export function isGreetingOnly(text: string) {
  const t = normalize(text).replace(/[!.,؟?،]+/g, "").trim();
  return /^(السلام عليكم( ورحمه الله( وبركاته)?)?|سلام|اهلا|اهلين|مرحبا|هاي|هلو|صباح الخير|مساء الخير|hi|hello|hey|salam)$/.test(t);
}

export const MENU = "اكتب رقم:\n1️⃣ أدوّر على عقار\n2️⃣ أعرض عقاري للبيع أو الإيجار\n3️⃣ أكلّم حد من الفريق";

/** custom = the admin's greeting from «تعليمات المساعد» (replaces the middle text; the menu always follows). */
export function welcome(name: string | null, custom = "") {
  const hi = name ? `أهلاً ${name.split(/\s+/)[0]} 👋` : "أهلاً بيك 👋";
  if (custom.trim()) return `${hi}\n${custom.trim()}\n\n${MENU}`;
  return `${hi}\nده واتساب *فاليو عقار* — عقارات برج العرب والساحل الشمالي.\n\nتقدر تكتبلي إنت بتدوّر على إيه بكلامك (مثلاً: شقة إيجار في برج العرب لحد 8000)، أو تبعت كود الإعلان.\n\n${MENU}`;
}

export const REPLY = {
  search: `تمام 👌 اكتبلي:\n• بيع ولا إيجار؟\n• المنطقة؟\n• النوع (شقة، فيلا، محل، أرض…)؟\n• الميزانية تقريباً؟\n\nأو اتفرج على كل العقارات: ${SITE}`,
  sell: `تمام 👌 تقدر تعرض عقارك من هنا في دقيقتين، وفريقنا هيراجعه وينزّله:\n${SITE}/sell\n\nولو حابب حد يساعدك، اكتب 3.`,
  human: "تمام ✅ بلّغت الفريق، وحد هيرد عليك هنا في أقرب وقت.",
  humanAfterHours: "تمام ✅ بلّغت الفريق. إحنا دلوقتي برّه مواعيد الشغل، وأول ما نبدأ حد هيرد عليك هنا.",
  fallback: `وصلتنا رسالتك ✅ حد من الفريق هيرد عليك قريب.\n\n${MENU}`,
  notFound: "مالقيتش إعلان بالكود ده، ممكن يكون اتباع أو اتشال. اكتبلي إنت بتدوّر على إيه وأنا أساعدك.",
} as const;

export type ListingCard = {
  id: string; code: string | null; type: string; status: string; city: string | null; area: string | null;
  size: number | null; rooms: number | null; price: number | null; available: boolean;
};

const money = (n: number) => new Intl.NumberFormat("ar-EG").format(n);

/** One listing as a short WhatsApp block with its link. */
export function listingText(p: ListingCard) {
  const place = p.area && p.area !== p.city ? `${p.area}، ${p.city ?? ""}` : p.city || p.area || "";
  const purpose = p.status === "بيع" ? "للبيع" : p.status === "إيجار" ? "للإيجار" : p.status === "مصيف" ? "مصيف" : p.status;
  const bits = [`${p.type} ${purpose}`, place, p.size ? `${money(p.size)} م²` : "", p.rooms ? `${money(p.rooms)} غرف` : ""].filter(Boolean).join(" · ");
  const price = p.price ? `💰 ${money(p.price)} ج.م` : "";
  const state = p.available ? "" : "⚠️ محجوز / مش متاح دلوقتي";
  return [`🏠 ${p.code ? `*${p.code}* — ` : ""}${bits}`, price, state, `${SITE}/properties/${p.id}`].filter(Boolean).join("\n");
}

/** Cairo hour now (0-23). */
export function cairoHour(now = new Date()) {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: "Africa/Cairo", hour: "numeric", hourCycle: "h23" }).format(now));
}
export const isWorkTime = (hours: WorkHours, now = new Date()) => { const h = cairoHour(now); return h >= hours.start && h < hours.end; };
