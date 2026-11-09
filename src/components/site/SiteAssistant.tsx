import { useEffect, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Send, Sparkles, X, MapPin, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { askAssistant, assistantInfo, browseListings, type BrowseFilters } from "@/lib/assistant.functions";
import type { ListingCard } from "@/lib/whatsapp-bot";
import { cleanPhone } from "@/lib/phone";
import { getAttribution } from "@/lib/attribution";
import { t, useLang } from "@/lib/i18n";
import { inputCls } from "./ui";
import { HIDDEN, WhatsAppMark, useFloatingWhatsapp } from "./FloatingWhatsApp";
import { CITY_NAMES, WHATSAPP_NUMBER, waLink, formatPrice, withUnitCode } from "./data";

type Purpose = "sale" | "rent" | "summer";
/** What the visitor picked so far in the guided search. */
type Guide = { purpose?: Purpose | undefined; area?: string | undefined; type?: string | undefined; min?: number | undefined; max?: number | undefined };
/** A button under the assistant's last message. */
type Act =
  | { k: "purpose"; v: Purpose } | { k: "area"; v: string } | { k: "type"; v: string } | { k: "budget"; min?: number | undefined; max?: number | undefined }
  | { k: "step"; v: "area" | "type" | "budget" } | { k: "more" } | { k: "results" } | { k: "restart" } | { k: "contact" }
  | { k: "ask"; q: string } | { k: "page"; href: string } | { k: "viewing" } | { k: "wa" };
type Opt = { label: string; act: Act };
type Msg = {
  role: "user" | "model"; text: string; listings?: ListingCard[] | undefined; offerContact?: boolean | undefined;
  options?: Opt[] | undefined; picked?: ListingCard | undefined; viewing?: ListingCard | undefined;
};
type Request = Record<string, string | number>;

const STORE = "va-assistant";
const GUIDE_STORE = "va-assistant-guide";
const POS = "va-assistant-pos";

const START: Opt[] = [
  { label: "🏠 عاوز أشتري", act: { k: "purpose", v: "sale" } },
  { label: "🔑 عاوز أأجّر", act: { k: "purpose", v: "rent" } },
  { label: "🏖️ مصيف", act: { k: "purpose", v: "summer" } },
  { label: "📝 عاوز أعرض عقاري", act: { k: "page", href: "/sell" } },
  { label: "⏳ سألت على عقار ومحدش رد", act: { k: "ask", q: "سألت على عقار ومحدش رد عليا" } },
  { label: "📱 التطبيق", act: { k: "ask", q: "عاوز أنزّل تطبيق فاليو عقار" } },
];
const TYPES: Record<Purpose, string[]> = {
  sale: ["شقة", "فيلا", "دوبلكس", "محل", "أرض"],
  rent: ["شقة", "فيلا", "محل", "مكتب"],
  summer: ["شاليه", "شقة", "فيلا"],
};
const BUDGETS: Record<Purpose, [string, number | undefined, number | undefined][]> = {
  sale: [["لحد مليون", undefined, 1_000_000], ["من 1 لـ 2 مليون", 1_000_000, 2_000_000], ["من 2 لـ 4 مليون", 2_000_000, 4_000_000], ["أكتر من 4 مليون", 4_000_000, undefined]],
  rent: [["لحد 5,000 في الشهر", undefined, 5000], ["من 5 لـ 10 آلاف", 5000, 10_000], ["من 10 لـ 20 ألف", 10_000, 20_000], ["أكتر من 20 ألف", 20_000, undefined]],
  summer: [["لحد 2,000 الليلة", undefined, 2000], ["من 2 لـ 5 آلاف", 2000, 5000], ["أكتر من 5 آلاف", 5000, undefined]],
};
const PURPOSE_WORD: Record<Purpose, string> = { sale: "للبيع", rent: "للإيجار", summer: "مصيف" };

type Pos = { x: number; y: number };
const loadPos = (): Pos | null => { try { const p = JSON.parse(localStorage.getItem(POS) || "null") as Pos | null; return p && Number.isFinite(p.x) && Number.isFinite(p.y) ? p : null; } catch { return null; } };
/** Keep the button on screen (also after the phone rotates). */
const clamp = (p: Pos, w = 180, h = 56): Pos => ({ x: Math.min(Math.max(8, p.x), window.innerWidth - w - 8), y: Math.min(Math.max(8, p.y), window.innerHeight - h - 8) });
const load = (): Msg[] => { try { return JSON.parse(sessionStorage.getItem(STORE) || "[]") as Msg[]; } catch { return []; } };
const save = (m: Msg[]) => { try { sessionStorage.setItem(STORE, JSON.stringify(m.slice(-30))); } catch { /* storage blocked */ } };
const loadGuide = (): Guide => { try { return JSON.parse(sessionStorage.getItem(GUIDE_STORE) || "{}") as Guide; } catch { return {}; } };
const pagePath = (p: ListingCard) => p.path ?? `/properties/${p.id}`;

/** A listing in the chat: tapping it picks it (the assistant then offers what to do next). */
function ListingMini({ p, onPick, picked }: { p: ListingCard; onPick?: ((p: ListingCard) => void) | undefined; picked?: boolean | undefined }) {
  const place = p.area && p.area !== p.city ? `${p.area}، ${p.city ?? ""}` : p.city || p.area || "";
  const body = (
    <>
      <p className="flex items-center justify-between gap-2 font-bold text-primary">
        <span>{p.code ? `${p.code} · ` : ""}{t(p.type)} {p.status === "بيع" ? t("للبيع") : p.status === "إيجار" ? t("للإيجار") : t(p.status)}</span>
        {picked && <Check className="size-4 shrink-0 text-teal" />}
      </p>
      {place && <p className="mt-0.5 flex items-center gap-1 text-muted-foreground"><MapPin className="size-3" />{place}</p>}
      <p className="mt-1 flex flex-wrap gap-x-2 text-muted-foreground">
        {p.size ? <span>{formatPrice(p.size)} {t("م²")}</span> : null}
        {p.rooms ? <span>{formatPrice(p.rooms)} {t("غرف")}</span> : null}
        {p.price ? <span className="font-bold text-teal">{formatPrice(p.price)} {t("ج.م")}</span> : null}
      </p>
      {!p.available && <p className="mt-1 font-bold text-destructive">{t("محجوز / مش متاح دلوقتي")}</p>}
      {onPick && <p className="mt-1.5 text-[11px] font-bold text-teal">{t("اختار دي ←")}</p>}
    </>
  );
  const cls = `block w-full rounded-xl border bg-background p-2.5 text-start text-xs transition ${picked ? "border-teal" : "hover:border-teal"}`;
  return onPick
    ? <button type="button" onClick={() => onPick(p)} className={cls}>{body}</button>
    : <a href={pagePath(p)} className={cls}>{body}</a>;
}

/** «سيب رقمك»: the visitor's details become a request lead with what the assistant understood. */
function ContactForm({ request, transcript, onDone }: { request: Request; transcript: string; onDone: () => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const p = cleanPhone(phone);
    if (name.trim().length < 2 || !p) { toast.error(t("اكتب الاسم ورقم هاتف صحيح")); return; }
    setBusy(true);
    const purpose = request["purpose"];
    const { error } = await supabase.from("leads").insert({
      name: name.trim(), phone: p, kind: "request", original_source: "website", utm: getAttribution(),
      purpose: purpose === "sale" || purpose === "rent" || purpose === "summer" ? purpose : null,
      property_type: typeof request["property_type"] === "string" ? String(request["property_type"]).slice(0, 60) : null,
      area: typeof request["area"] === "string" ? String(request["area"]).slice(0, 60) : null,
      budget: typeof request["budget"] === "number" ? request["budget"] : null,
      details: `من المساعد الذكي في الموقع:\n${transcript}`.slice(0, 1000),
    });
    setBusy(false);
    if (error) { toast.error(t("الطلب ماتبعتش، جرّب تاني")); return; }
    onDone();
  }
  return (
    <form onSubmit={submit} className="mt-2 grid gap-2 rounded-xl border bg-background p-2.5">
      <p className="text-xs font-bold text-primary">{t("سيب اسمك ورقمك وحد من فريق فاليو عقار هيكلّمك:")}</p>
      <input className={`${inputCls} h-10`} placeholder={t("الاسم")} value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
      <input className={`${inputCls} h-10`} placeholder={t("رقم الهاتف")} inputMode="tel" dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={20} />
      <button disabled={busy} className="h-10 rounded-xl bg-primary text-sm font-bold text-primary-foreground disabled:opacity-60">{busy ? "..." : t("ابعت")}</button>
    </form>
  );
}

const WHEN = ["النهارده", "بكرة", "خلال الأسبوع", "أي وقت"];

/** «احجز معاينة»: an inquiry lead on the picked listing, so it reaches the listing's owner (or the team) like the listing page's form. */
function ViewingForm({ p, onDone }: { p: ListingCard; onDone: () => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [when, setWhen] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const ph = cleanPhone(phone);
    if (name.trim().length < 2 || !ph) { toast.error(t("اكتب الاسم ورقم هاتف صحيح")); return; }
    setBusy(true);
    const { error } = await supabase.from("leads").insert({
      name: name.trim(), phone: ph, kind: "inquiry", property_id: p.id, original_source: "website", utm: getAttribution(),
      details: `طلب معاينة من المساعد الذكي${p.code ? ` — ${p.code}` : ""}${when ? ` — الميعاد المناسب: ${when}` : ""}`,
    });
    setBusy(false);
    if (error) { toast.error(t("الطلب ماتبعتش، جرّب تاني")); return; }
    onDone();
  }
  return (
    <form onSubmit={submit} className="mt-2 grid gap-2 rounded-xl border bg-background p-2.5">
      <input className={`${inputCls} h-10`} placeholder={t("الاسم")} value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
      <input className={`${inputCls} h-10`} placeholder={t("رقم الهاتف")} inputMode="tel" dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={20} />
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("الميعاد المناسب")}>
        {WHEN.map((w) => (
          <button key={w} type="button" onClick={() => setWhen(w)} aria-pressed={when === w}
            className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${when === w ? "border-primary bg-primary text-primary-foreground" : "text-primary"}`}>{t(w)}</button>
        ))}
      </div>
      <button disabled={busy} className="h-10 rounded-xl bg-primary text-sm font-bold text-primary-foreground disabled:opacity-60">{busy ? "..." : t("احجز المعاينة")}</button>
    </form>
  );
}

/** Floating AI assistant (opposite corner from the WhatsApp button): guides the visitor with buttons, finds real listings and takes requests. */
export function SiteAssistant() {
  useLang();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const ask = useServerFn(askAssistant);
  const browse = useServerFn(browseListings);
  const wa = useFloatingWhatsapp().data || WHATSAPP_NUMBER;
  const [open, setOpen] = useState(false);
  // The visible height (shrinks when the phone keyboard opens), so the chat never runs past the screen.
  const [vh, setVh] = useState<number | null>(null);
  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    const vv = window.visualViewport;
    const read = () => setVh(Math.round(vv?.height ?? window.innerHeight));
    read();
    vv?.addEventListener("resize", read);
    window.addEventListener("resize", read);
    return () => { vv?.removeEventListener("resize", read); window.removeEventListener("resize", read); };
  }, [open]);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [request, setRequest] = useState<Request>({});
  const [sent, setSent] = useState(false);
  const [guide, setGuide] = useState<Guide>({});
  // The last guided results, so «ارجع للنتايج» and «اعرض أكتر» work after a listing was picked.
  const [results, setResults] = useState<{ listings: ListingCard[]; more: boolean; offset: number } | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const info = useServerFn(assistantInfo);
  const settings = useQuery({ queryKey: ["assistant-info"], queryFn: () => info(), staleTime: 5 * 60_000 }).data;
  // Draggable: the visitor can move the button anywhere; a press without moving opens the chat.
  const [pos, setPos] = useState<Pos | null>(null);
  const drag = useRef<{ dx: number; dy: number; sx: number; sy: number; moved: boolean } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => { setMsgs(load()); setGuide(loadGuide()); const p = loadPos(); if (p) setPos(clamp(p)); }, []);
  useEffect(() => { save(msgs); end.current?.scrollIntoView({ block: "end" }); }, [msgs, open]);
  useEffect(() => { try { sessionStorage.setItem(GUIDE_STORE, JSON.stringify(guide)); } catch { /* storage blocked */ } }, [guide]);
  useEffect(() => {
    const fit = () => setPos((p) => (p ? clamp(p, btn.current?.offsetWidth, btn.current?.offsetHeight) : p));
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  if (HIDDEN.some((p) => pathname.startsWith(p)) || (settings && settings.floating !== "assistant" && settings.floating !== "both")) return null;

  function onDown(e: React.PointerEvent<HTMLButtonElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    drag.current = { dx: e.clientX - r.left, dy: e.clientY - r.top, sx: e.clientX, sy: e.clientY, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onMove(e: React.PointerEvent<HTMLButtonElement>) {
    const d = drag.current;
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 8) return;
    d.moved = true;
    setPos(clamp({ x: e.clientX - d.dx, y: e.clientY - d.dy }, e.currentTarget.offsetWidth, e.currentTarget.offsetHeight));
  }
  function onUp() {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.moved) { setPos((p) => { try { if (p) localStorage.setItem(POS, JSON.stringify(p)); } catch { /* storage blocked */ } return p; }); return; }
    setOpen((o) => !o);
  }

  async function send(raw: string) {
    const q = raw.trim();
    if (!q || busy) return;
    const next: Msg[] = [...msgs, { role: "user", text: q }];
    setMsgs(next); setText(""); setBusy(true);
    const r = await ask({ data: { messages: next.slice(-12).map((m) => ({ role: m.role, text: m.text.slice(0, 1500) })) } })
      .catch(() => ({ ok: false as const, error: "network" }));
    setBusy(false);
    if (!r.ok) {
      setMsgs([...next, { role: "model", text: r.error === "rate" ? t("بعت رسايل كتير، استنى دقايق وجرّب تاني.") : t("حصلت مشكلة في الاتصال، جرّب تاني.") }]);
      return;
    }
    if (Object.keys(r.request).length) setRequest((x) => ({ ...x, ...r.request }));
    const fallback = !r.ai && !r.text;
    setMsgs([...next, {
      role: "model",
      text: fallback ? t("المساعد الذكي مش متاح دلوقتي. تقدر تدوّر من البحث فوق، أو تسيب رقمك، أو تكلّمنا واتساب.") : r.text || (r.listings.length ? t("دي أنسب حاجات لقيتها:") : ""),
      listings: r.listings, offerContact: r.handoff || fallback || (!r.listings.length && Object.keys(r.request).length > 0),
      options: r.listings.length ? [{ label: t("🔄 دوّر بالأزرار"), act: { k: "restart" } }] : undefined,
    }]);
  }

  // ——— Guided search: one question per step, always with buttons, until the visitor books a viewing or leaves a request.
  const say = (base: Msg[], m: Msg) => setMsgs([...base, m]);
  const startOpts = (): Opt[] => START.map((o) => ({ ...o, label: t(o.label) }));
  const restartOpts = (): Opt[] => [{ label: t("🔄 ابدأ من الأول"), act: { k: "restart" } }];
  const askArea = (base: Msg[]) => say(base, {
    role: "model", text: t("تمام 👌 في أنهي منطقة؟"),
    options: [...CITY_NAMES.map((c) => ({ label: t(c), act: { k: "area", v: c } as Act })), { label: t("أي مكان"), act: { k: "area", v: "" } }],
  });
  const askType = (base: Msg[], g: Guide) => say(base, {
    role: "model", text: t("نوع العقار إيه؟"),
    options: [...TYPES[g.purpose ?? "sale"].map((x) => ({ label: t(x), act: { k: "type", v: x } as Act })), { label: t("أي نوع"), act: { k: "type", v: "" } }],
  });
  const askBudget = (base: Msg[], g: Guide) => say(base, {
    role: "model", text: t("الميزانية تقريبًا كام؟"),
    options: [...BUDGETS[g.purpose ?? "sale"].map(([l, min, max]) => ({ label: t(l), act: { k: "budget", min, max } as Act })), { label: t("مش فارقة"), act: { k: "budget" } }],
  });

  async function search(base: Msg[], g: Guide, offset = 0) {
    if (!g.purpose) { say(base, { role: "model", text: t("بتدوّر على إيه؟"), options: startOpts() }); return; }
    setBusy(true); setMsgs(base);
    const filters: BrowseFilters = { purpose: g.purpose, area: g.area || undefined, type: g.type || undefined, min: g.min, max: g.max, offset };
    const r = await browse({ data: filters }).catch(() => ({ ok: false as const, error: "network" }));
    setBusy(false);
    if (!r.ok) { say(base, { role: "model", text: r.error === "rate" ? t("بعت رسايل كتير، استنى دقايق وجرّب تاني.") : t("حصلت مشكلة في الاتصال، جرّب تاني."), options: restartOpts() }); return; }
    // What the visitor asked for, in case they leave their number.
    setRequest({ purpose: g.purpose, ...(g.type ? { property_type: g.type } : {}), ...(g.area ? { area: g.area } : {}), ...(g.max ? { budget: g.max } : {}) });
    if (!r.listings.length) {
      say(base, {
        role: "model", text: offset ? t("دي كل الوحدات المناسبة 👆 تحب تغيّر حاجة؟") : t("مالقيتش حاجة مطابقة دلوقتي 😕 جرّب تغيّر حاجة، أو سيب طلبك وأول ما يتوفر نكلّمك:"),
        options: [
          { label: t("💰 غيّر الميزانية"), act: { k: "step", v: "budget" } },
          { label: t("📍 منطقة تانية"), act: { k: "step", v: "area" } },
          { label: t("🏠 نوع تاني"), act: { k: "step", v: "type" } },
          { label: t("📝 سيب طلبك"), act: { k: "contact" } },
          ...restartOpts(),
        ],
      });
      return;
    }
    setResults({ listings: r.listings, more: r.more, offset });
    say(base, {
      role: "model", text: offset ? t("ودول كمان 👇 دوس على الوحدة اللي عجبتك:") : t("لقيتلك وحدات مناسبة 👇 دوس على اللي عجبتك وأكمّل معاك:"),
      listings: r.listings,
      options: [
        ...(r.more ? [{ label: t("➕ اعرض أكتر"), act: { k: "more" } as Act }] : []),
        { label: t("💰 غيّر الميزانية"), act: { k: "step", v: "budget" } },
        { label: t("📍 منطقة تانية"), act: { k: "step", v: "area" } },
        ...restartOpts(),
      ],
    });
  }

  function pick(p: ListingCard) {
    if (busy) return;
    const base: Msg[] = [...msgs, { role: "user", text: `${t("اخترت")} ${p.code ?? t(p.type)}` }];
    say(base, {
      role: "model", text: t("اختيار حلو 👌 تحب تعمل إيه؟"), picked: p,
      options: [
        { label: t("📅 احجز معاينة"), act: { k: "viewing" } },
        { label: t("💬 اسأل صاحب الإعلان واتساب"), act: { k: "wa" } },
        { label: t("📄 الصور والتفاصيل"), act: { k: "page", href: pagePath(p) } },
        ...(results ? [{ label: t("🔙 ارجع للنتايج"), act: { k: "results" } as Act }] : []),
      ],
    });
  }

  function run(o: Opt, from: Msg) {
    if (busy) return;
    const a = o.act;
    // Links don't add chat lines.
    if (a.k === "page") { window.location.assign(a.href); return; }
    if (a.k === "wa" && from.picked) {
      const p = from.picked;
      window.open(waLink(wa, withUnitCode(t("مرحبًا، أستفسر عن العقار"), p.code, pagePath(p))), "_blank", "noopener,noreferrer");
      return;
    }
    if (a.k === "ask") { void send(t(a.q)); return; }
    const base: Msg[] = [...msgs, { role: "user", text: o.label }];
    switch (a.k) {
      case "restart": setGuide({}); setResults(null); say(base, { role: "model", text: t("بتدوّر على إيه؟"), options: startOpts() }); return;
      case "purpose": { const g = { purpose: a.v }; setGuide(g); askArea(base); return; }
      case "area": { const g = { ...guide, area: a.v }; setGuide(g); if (g.type !== undefined && g.min !== undefined) void search(base, g); else askType(base, g); return; }
      case "type": { const g = { ...guide, type: a.v }; setGuide(g); if (g.min !== undefined || g.max !== undefined) void search(base, g); else askBudget(base, g); return; }
      case "budget": { const g = { ...guide, min: a.min ?? 0, max: a.max }; setGuide(g); void search(base, g); return; }
      case "step": if (a.v === "area") askArea(base); else if (a.v === "type") askType(base, guide); else askBudget(base, guide); return;
      case "more": void search(base, guide, (results?.offset ?? 0) + 4); return;
      case "results": if (results) say(base, { role: "model", text: t("دي النتايج تاني 👇"), listings: results.listings, options: restartOpts() }); return;
      case "contact": say(base, { role: "model", text: t("تمام 📝"), offerContact: true }); return;
      case "viewing": if (from.picked) say(base, { role: "model", text: t("تمام 📅 سيب اسمك ورقمك وإمتى يناسبك، وصاحب الإعلان أو فريقنا هيكلّمك يحدد الميعاد:"), viewing: from.picked }); return;
      default:
    }
  }

  const transcript = msgs.filter((m) => m.role === "user").map((m) => `- ${m.text}`).join("\n");
  const lastIdx = msgs.length - 1;

  return (
    <div className="print:hidden">
      {open && (
        <div role="dialog" aria-label={t("فاليو عقار")}
          // Phones: between the header (~6rem) and the floating button (10rem from the bottom); at least 15rem.
          // Keyboard open (little height left): sit at the bottom edge and take what's visible.
          style={vh ? (vh < 520 ? { bottom: 8, top: 8, maxHeight: "none" } : { maxHeight: `max(15rem, min(${Math.round(vh * 0.65)}px, ${vh}px - 16.5rem))` }) : undefined}
          className="fixed inset-x-2 bottom-[calc(10rem+env(safe-area-inset-bottom))] z-50 flex max-h-[min(65dvh,calc(100dvh-16.5rem))] min-h-0 flex-col overflow-hidden rounded-2xl border bg-card shadow-float sm:inset-x-auto sm:w-96 ltr:sm:left-4 rtl:sm:right-4 lg:bottom-24">
          <div className="flex items-center gap-2 bg-primary px-4 py-3 text-primary-foreground">
            <Sparkles className="size-5 text-teal" />
            <div className="flex-1">
              <p className="text-sm font-extrabold">{t("مساعد فاليو عقار")}</p>
              <p className="flex items-center gap-1.5 text-[11px] opacity-80"><span className="size-2 rounded-full bg-emerald-400" />{t("متاح دلوقتي · بيرد في ثواني")}</p>
            </div>
            {/* WhatsApp lives here now, so the page keeps a single floating button. */}
            <a href={waLink(wa, t("مرحبًا، أنا جاي من صفحة فاليو عقار وعندي استفسار / محتاج مساعدة."))} target="_blank" rel="noreferrer"
              aria-label={t("كلّمنا واتساب")} title={t("كلّمنا واتساب")} className="grid size-9 place-items-center rounded-full bg-[#25D366] text-white"><WhatsAppMark className="size-5" /></a>
            <button type="button" onClick={() => setOpen(false)} aria-label={t("إغلاق")} className="grid size-8 place-items-center rounded-lg hover:bg-white/10"><X className="size-4" /></button>
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto p-3">
            <div className="max-w-[90%] rounded-2xl bg-secondary px-3 py-2 text-sm text-primary">
              {settings?.welcome || t("أهلاً بيك 👋 قولّي بتدوّر على إيه بكلامك، زي: «شقة إيجار في برج العرب لحد 8000»، أو ابعت كود الإعلان.")}
            </div>
            {msgs.length === 0 && (
              <div className="flex flex-wrap gap-1.5">
                {START.map((o) => <button key={o.label} type="button" onClick={() => run({ ...o, label: t(o.label) }, { role: "model", text: "" })} className="rounded-full border px-3 py-1.5 text-xs font-bold text-primary hover:border-teal">{t(o.label)}</button>)}
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[90%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-secondary text-primary"}`}>
                  {m.text}
                  {m.picked && <div className="mt-2"><ListingMini p={m.picked} picked /></div>}
                  {m.listings?.length ? <div className="mt-2 grid gap-1.5">{m.listings.map((p) => <ListingMini key={p.id} p={p} onPick={i === lastIdx ? pick : undefined} />)}</div> : null}
                  {m.viewing && i === lastIdx && <ViewingForm p={m.viewing} onDone={() => setMsgs((x) => [...x, {
                    role: "model", text: t("تمام ✅ طلب المعاينة وصل، وصاحب الإعلان أو فريق فاليو عقار هيكلّمك قريب يحدد الميعاد."),
                    options: [{ label: t("🔍 دوّر على حاجة تانية"), act: { k: "restart" } }],
                  }])} />}
                  {m.offerContact && i === lastIdx && !sent && <ContactForm request={request} transcript={transcript} onDone={() => { setSent(true); setMsgs((x) => [...x, { role: "model", text: t("تمام ✅ طلبك وصل، وحد من الفريق هيكلّمك قريب."), options: [{ label: t("🔍 دوّر على حاجة تانية"), act: { k: "restart" } }] }]); }} />}
                  {m.offerContact && i === lastIdx && (
                    <a href={waLink(wa, t("مرحبًا، كنت بكلّم المساعد الذكي في موقع فاليو عقار ومحتاج مساعدة."))} target="_blank" rel="noreferrer"
                      className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-[#128C7E] underline"><WhatsAppMark className="size-4" />{t("أو كلّمنا واتساب")}</a>
                  )}
                  {m.options?.length && i === lastIdx ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {m.options.map((o) => (
                        <button key={o.label} type="button" disabled={busy} onClick={() => run(o, m)}
                          className="rounded-full border bg-background px-3 py-1.5 text-xs font-bold text-primary hover:border-teal disabled:opacity-50">{o.label}</button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
            {busy && <div className="w-16 animate-pulse rounded-2xl bg-secondary px-3 py-2 text-sm text-primary">…</div>}
            <div ref={end} />
          </div>
          <form onSubmit={(e) => { e.preventDefault(); void send(text); }} className="flex gap-2 border-t p-2.5">
            <input value={text} onChange={(e) => setText(e.target.value)} maxLength={500} placeholder={t("اكتب سؤالك…")} aria-label={t("اكتب سؤالك…")} className={`${inputCls} h-10 flex-1`} />
            <button type="submit" disabled={busy || !text.trim()} aria-label={t("ابعت")} className="grid size-10 shrink-0 place-items-center rounded-xl bg-teal text-accent-foreground disabled:opacity-50"><Send className="size-4" /></button>
          </form>
          <p className="px-3 pb-2 text-[10px] text-muted-foreground">{t("مساعد بالذكاء الاصطناعي وممكن يغلط؛ التفاصيل الأكيدة في صفحة كل عقار.")}</p>
        </div>
      )}
      <button ref={btn} type="button" aria-expanded={open} aria-label={t("مساعد فاليو عقار — اسألني عن أي عقار")} title={t("اسحبني لأي مكان")}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => { drag.current = null; }}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen((o) => !o); } }}
        style={pos ? { left: pos.x, top: pos.y } : undefined}
        className={`fixed z-40 flex touch-none select-none items-center gap-2 rounded-full bg-primary py-1.5 ps-1.5 pe-3.5 text-primary-foreground sm:pe-4 shadow-float transition-[transform,box-shadow] hover:scale-[1.03] active:cursor-grabbing ${pos ? "" : "bottom-[calc(5.5rem+env(safe-area-inset-bottom))] ltr:left-4 rtl:right-4 lg:bottom-6"} cursor-grab`}>
        <span className="relative grid size-11 place-items-center rounded-full bg-white/10">
          {open ? <X className="size-5" /> : <Sparkles className="size-5 text-teal" />}
          <span className="absolute -bottom-0.5 size-3 rounded-full border-2 border-primary bg-emerald-400 ltr:-right-0.5 rtl:-left-0.5" />
        </span>
        <span className="text-start leading-tight">
          <span className="block text-xs font-extrabold sm:text-sm">{t("مساعد فاليو عقار")}</span>
          <span className="block text-[10px] opacity-75">{t("اسألني عن أي عقار")}</span>
        </span>
      </button>
    </div>
  );
}
