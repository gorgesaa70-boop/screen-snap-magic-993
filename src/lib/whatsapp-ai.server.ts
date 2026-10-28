import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { listingText, type ListingCard } from "./whatsapp-bot";

/**
 * The bot's AI answers (Google Gemini, free tier). It may only talk about listings it found with search_listings,
 * never invents prices or places, never gives out brokers' numbers (all contact goes through Value Aqar), and hands
 * the chat to the team when asked or unsure. Without GEMINI_API_KEY the caller falls back to the fixed replies.
 */

type Db = SupabaseClient<Database>;
type Turn = { role: "user" | "model"; text: string };
export type AiResult = { text: string; handoff: boolean; request: Partial<{ purpose: "sale" | "rent" | "summer"; property_type: string; area: string; budget: number }> };

const SYSTEM = `إنت مساعد ذكي لمنصة «فاليو عقار» (valueaqar.com)، منصة عقارات في برج العرب الجديدة والعلمين والساحل الشمالي.
اتكلم بالعامية المصرية، بأدب وباختصار (رسالة قصيرة، من غير مقدمات طويلة). لو العميل كتب إنجليزي رد إنجليزي.
مهمتك: تفهم العميل عاوز إيه (بيع/شراء/إيجار/مصيف، المنطقة، النوع، الميزانية، عدد الأوض) وتدوّر له بالأداة search_listings.
قواعد لازم تلتزم بيها:
- ماتذكرش أي عقار أو سعر أو مكان مش راجع من search_listings. مافيش تأليف خالص.
- لما تلاقي نتايج، اكتب جملة واحدة قصيرة بس، والنظام هيبعت كروت العقارات بروابطها بعد كلامك. ماتكتبش تفاصيل العقارات بنفسك.
- لو مالقيتش، قول كده بصراحة واقترح توسّع البحث، وسجّل طلبه بـ save_request عشان الفريق يدوّرله.
- أول ما تعرف هو عاوز إيه (حتى لو جزء)، سجّله بـ save_request.
- ماتديش أرقام تليفونات أو واتساب وسطاء أو ملاك. التواصل كله من خلال فاليو عقار.
- لو طلب يكلم موظف، أو اشتكى، أو سأل حاجة مش عقارات (أسعار سوق، قانون، تمويل)، أو مش فاهم: استخدم handoff.
- لو عاوز يعرض عقاره للبيع أو الإيجار: ابعتله الرابط ${"https://valueaqar.com/sell"}.
- ماتطلبش بيانات شخصية زيادة (بطاقة، عنوان).`;

/** Per-channel line: on WhatsApp we already have the number; on the site the visitor may leave it in the form. */
const CHANNEL = {
  whatsapp: "إنت بترد على واتساب، ورقم العميل عندنا خلاص، فماتطلبهوش.",
  web: "إنت جوه موقع فاليو عقار (فقاعة شات اسمها «فاليو عقار»). لو العميل عاوز حد يكلّمه أو سأل على عقار ومحدش رد عليه، استخدم handoff، والموقع هيطلب منه اسمه ورقمه في فورم صغير. ماتطلبش الرقم في الشات. لو سأل عن التطبيق: ينزّله من https://valueaqar.com/app.",
} as const;
export type Channel = keyof typeof CHANNEL;

const TOOLS = [{
  functionDeclarations: [
    {
      name: "search_listings",
      description: "يدوّر في العقارات المنشورة على فاليو عقار. كل الحقول اختيارية.",
      parameters: {
        type: "object",
        properties: {
          purpose: { type: "string", enum: ["sale", "rent", "summer"], description: "بيع / إيجار / مصيف" },
          type: { type: "string", description: "نوع العقار بالعربي: شقة، فيلا، دوبلكس، شاليه، أرض، محل، مكتب، عيادة…" },
          area: { type: "string", description: "المنطقة أو المدينة بالعربي، مثلاً برج العرب الجديدة، العلمين" },
          max_price: { type: "number", description: "أقصى سعر بالجنيه" },
          min_price: { type: "number", description: "أقل سعر بالجنيه" },
          min_rooms: { type: "integer", description: "أقل عدد أوض" },
        },
      },
    },
    {
      name: "save_request",
      description: "يسجّل طلب العميل في ملفه عشان الفريق يتابعه.",
      parameters: {
        type: "object",
        properties: {
          purpose: { type: "string", enum: ["sale", "rent", "summer"] },
          property_type: { type: "string" },
          area: { type: "string" },
          budget: { type: "number" },
        },
      },
    },
    {
      name: "handoff",
      description: "يحوّل المحادثة لموظف من الفريق ويوقف الرد الآلي.",
      parameters: { type: "object", properties: { reason: { type: "string" } } },
    },
  ],
}];

const STATUS: Record<string, string> = { sale: "بيع", rent: "إيجار", summer: "مصيف" };
const clean = (s: unknown, max = 40) => String(s ?? "").replace(/[^\p{L}\p{N} -]/gu, "").trim().slice(0, max);

/** Up to 4 approved listings matching the filters. */
export async function searchListings(db: Db, args: Record<string, unknown>): Promise<ListingCard[]> {
  let q = db.from("properties")
    .select("id, listing_no, type, status, city, area, size, rooms, price, availability")
    .eq("review_status", "approved").in("category", ["residential", "mall", "industrial"]);
  const purpose = STATUS[String(args["purpose"] ?? "")];
  if (purpose) q = q.eq("status", purpose);
  const type = clean(args["type"]);
  if (type) q = q.ilike("type", `%${type}%`);
  const area = clean(args["area"]);
  if (area) q = q.or(`area.ilike.%${area}%,city.ilike.%${area}%`);
  const max = Number(args["max_price"]), min = Number(args["min_price"]), rooms = Number(args["min_rooms"]);
  if (max > 0) q = q.lte("price", max);
  if (min > 0) q = q.gte("price", min);
  if (rooms > 0) q = q.gte("rooms", rooms);
  const { data, error } = await q.order("is_featured", { ascending: false }).order("created_at", { ascending: false }).limit(4);
  if (error) { console.error("wa bot search failed", error.code); return []; }
  return (data ?? []).map((r) => ({
    id: r.id, code: r.listing_no != null ? `VA-${r.listing_no}` : null, type: r.type, status: r.status, city: r.city, area: r.area,
    size: r.size != null ? Number(r.size) : null, rooms: r.rooms, price: r.price != null ? Number(r.price) : null,
    available: (r.availability ?? "available") === "available",
  }));
}

type Part = { text?: string; functionCall?: { name: string; args?: Record<string, unknown> }; functionResponse?: unknown };
type Content = { role: "user" | "model"; parts: Part[] };

async function callModel(model: string, key: string, contents: Content[], channel: Channel, extra: string): Promise<Content | null | "retry"> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: `${SYSTEM}\n- ${CHANNEL[channel]}${extra}` }] },
      contents, tools: TOOLS,
      generationConfig: { temperature: 0.3, maxOutputTokens: 500 },
    }),
    signal: AbortSignal.timeout(12_000),
  }).catch(() => null);
  if (!res) return "retry";
  if (!res.ok) {
    console.error("wa bot ai failed", model, res.status, (await res.text().catch(() => "")).slice(0, 200));
    // 429/503 = overloaded, 404 = model gone: try the next model instead of giving up.
    return res.status === 429 || res.status === 503 || res.status === 404 ? "retry" : null;
  }
  const json = (await res.json().catch(() => null)) as { candidates?: { content?: Content }[] } | null;
  return json?.candidates?.[0]?.content ?? null;
}

async function generate(contents: Content[], channel: Channel, extra: string): Promise<Content | null> {
  // GEMINI_APT_KEY: the name the secret was first saved under (typo) — accepted so it works without re-entering the key.
  const key = process.env["GEMINI_API_KEY"] || process.env["GEMINI_APT_KEY"];
  if (!key) return null;
  // gemini-2.5-flash is closed to new API keys (404), so default to the current flash model.
  // Fallbacks keep the assistant alive when the main model is overloaded or retired.
  const preferred = process.env["GEMINI_MODEL"] || "gemini-3.8-flash";
  const models = [preferred, "gemini-3.1-flash-lite", "gemini-2.5-flash-lite"].filter((m, i, a) => a.indexOf(m) === i);
  for (const model of models) {
    const out = await callModel(model, key, contents, channel, extra);
    if (out !== "retry") return out;
  }
  return null;
}

/** One AI turn: reads the recent chat, may search / save / hand off, and returns the reply text (null = AI unavailable). */
export async function aiReply(db: Db, history: Turn[], channel: Channel = "whatsapp"): Promise<(AiResult & { listings: ListingCard[] }) | null> {
  const contents: Content[] = history.slice(-12).map((t) => ({ role: t.role, parts: [{ text: t.text.slice(0, 1500) }] }));
  // The admin's «تعليمات المساعد» come after the fixed rules, which still win.
  const { getAssistantSettings } = await import("./assistant-settings.server");
  const { instructions } = await getAssistantSettings();
  const extra = instructions ? `\n\nتعليمات من إدارة فاليو عقار (التزم بيها طالما مش ضد القواعد اللي فوق):\n${instructions.slice(0, 4000)}` : "";
  const out: AiResult & { listings: ListingCard[] } = { text: "", handoff: false, request: {}, listings: [] };
  for (let step = 0; step < 3; step++) {
    const reply = await generate(contents, channel, extra);
    if (!reply) return step === 0 ? null : out;
    const calls = reply.parts.filter((p) => p.functionCall);
    const text = reply.parts.map((p) => p.text ?? "").join("").trim();
    if (!calls.length) { out.text = text; return out; }
    contents.push({ role: "model", parts: reply.parts });
    const responses: Part[] = [];
    for (const { functionCall } of calls) {
      const args = functionCall!.args ?? {};
      if (functionCall!.name === "search_listings") {
        const found = await searchListings(db, args);
        out.listings = found;
        responses.push({ functionResponse: { name: "search_listings", response: { count: found.length, results: found.map((f) => listingText(f)) } } });
      } else if (functionCall!.name === "save_request") {
        const p = String(args["purpose"] ?? "");
        out.request = {
          ...(p === "sale" || p === "rent" || p === "summer" ? { purpose: p } : {}),
          ...(clean(args["property_type"]) ? { property_type: clean(args["property_type"]) } : {}),
          ...(clean(args["area"], 60) ? { area: clean(args["area"], 60) } : {}),
          ...(Number(args["budget"]) > 0 ? { budget: Math.round(Number(args["budget"])) } : {}),
        };
        responses.push({ functionResponse: { name: "save_request", response: { saved: true } } });
      } else if (functionCall!.name === "handoff") {
        out.handoff = true;
        responses.push({ functionResponse: { name: "handoff", response: { done: true, note: "قول للعميل إن حد من الفريق هيرد عليه هنا قريب." } } });
      }
    }
    contents.push({ role: "user", parts: responses });
  }
  return out;
}
