import { useEffect, useRef, useState } from "react";
import { useRouterState, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Send, Sparkles, X, MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { askAssistant, assistantInfo } from "@/lib/assistant.functions";
import type { ListingCard } from "@/lib/whatsapp-bot";
import { cleanPhone } from "@/lib/phone";
import { getAttribution } from "@/lib/attribution";
import { t, useLang } from "@/lib/i18n";
import { inputCls } from "./ui";
import { HIDDEN, WhatsAppMark, useFloatingWhatsapp } from "./FloatingWhatsApp";
import { WHATSAPP_NUMBER, waLink, formatPrice } from "./data";

type Msg = { role: "user" | "model"; text: string; listings?: ListingCard[]; offerContact?: boolean };
type Request = Record<string, string | number>;

const STORE = "va-assistant";
const CHIPS = ["🏠 شقة للبيع في برج العرب", "🔑 شقة إيجار", "🏬 محل في مول", "📝 عاوز أعرض عقاري", "⏳ سألت على عقار ومحدش رد", "📱 التطبيق"];
const POS = "va-assistant-pos";
type Pos = { x: number; y: number };
const loadPos = (): Pos | null => { try { const p = JSON.parse(localStorage.getItem(POS) || "null") as Pos | null; return p && Number.isFinite(p.x) && Number.isFinite(p.y) ? p : null; } catch { return null; } };
/** Keep the button on screen (also after the phone rotates). */
const clamp = (p: Pos, w = 180, h = 56): Pos => ({ x: Math.min(Math.max(8, p.x), window.innerWidth - w - 8), y: Math.min(Math.max(8, p.y), window.innerHeight - h - 8) });
const load = (): Msg[] => { try { return JSON.parse(sessionStorage.getItem(STORE) || "[]") as Msg[]; } catch { return []; } };
const save = (m: Msg[]) => { try { sessionStorage.setItem(STORE, JSON.stringify(m.slice(-30))); } catch { /* storage blocked */ } };

function ListingMini({ p }: { p: ListingCard }) {
  const place = p.area && p.area !== p.city ? `${p.area}، ${p.city ?? ""}` : p.city || p.area || "";
  return (
    <Link to="/properties/$id" params={{ id: p.id }} className="block rounded-xl border bg-background p-2.5 text-xs transition hover:border-teal">
      <p className="font-bold text-primary">{p.code ? `${p.code} · ` : ""}{p.type} {p.status === "بيع" ? t("للبيع") : p.status === "إيجار" ? t("للإيجار") : p.status}</p>
      {place && <p className="mt-0.5 flex items-center gap-1 text-muted-foreground"><MapPin className="size-3" />{place}</p>}
      <p className="mt-1 flex flex-wrap gap-x-2 text-muted-foreground">
        {p.size ? <span>{formatPrice(p.size)} {t("م²")}</span> : null}
        {p.rooms ? <span>{formatPrice(p.rooms)} {t("غرف")}</span> : null}
        {p.price ? <span className="font-bold text-teal">{formatPrice(p.price)} {t("ج.م")}</span> : null}
      </p>
      {!p.available && <p className="mt-1 font-bold text-destructive">{t("محجوز / مش متاح دلوقتي")}</p>}
    </Link>
  );
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

/** Floating AI assistant (opposite corner from the WhatsApp button): finds real listings and takes requests. */
export function SiteAssistant() {
  useLang();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const ask = useServerFn(askAssistant);
  const wa = useFloatingWhatsapp().data || WHATSAPP_NUMBER;
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [request, setRequest] = useState<Request>({});
  const [sent, setSent] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const info = useServerFn(assistantInfo);
  const settings = useQuery({ queryKey: ["assistant-info"], queryFn: () => info(), staleTime: 5 * 60_000 }).data;
  // Draggable: the visitor can move the button anywhere; a press without moving opens the chat.
  const [pos, setPos] = useState<Pos | null>(null);
  const drag = useRef<{ dx: number; dy: number; sx: number; sy: number; moved: boolean } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => { setMsgs(load()); const p = loadPos(); if (p) setPos(clamp(p)); }, []);
  useEffect(() => { save(msgs); end.current?.scrollIntoView({ block: "end" }); }, [msgs, open]);
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
    }]);
  }
  const transcript = msgs.filter((m) => m.role === "user").map((m) => `- ${m.text}`).join("\n");

  return (
    <div className="print:hidden">
      {open && (
        <div role="dialog" aria-label={t("فاليو عقار")}
          className="fixed inset-x-2 bottom-[calc(10rem+env(safe-area-inset-bottom))] z-50 flex max-h-[65vh] flex-col overflow-hidden rounded-2xl border bg-card shadow-float sm:inset-x-auto sm:w-96 ltr:sm:left-4 rtl:sm:right-4 lg:bottom-24">
          <div className="flex items-center gap-2 bg-primary px-4 py-3 text-primary-foreground">
            <Sparkles className="size-5 text-teal" />
            <div className="flex-1">
              <p className="text-sm font-extrabold">{t("فاليو عقار")}</p>
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
                {CHIPS.map((c) => <button key={c} type="button" onClick={() => send(t(c))} className="rounded-full border px-3 py-1.5 text-xs font-bold text-primary hover:border-teal">{t(c)}</button>)}
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[90%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-secondary text-primary"}`}>
                  {m.text}
                  {m.listings?.length ? <div className="mt-2 grid gap-1.5">{m.listings.map((p) => <ListingMini key={p.id} p={p} />)}</div> : null}
                  {m.offerContact && i === msgs.length - 1 && !sent && <ContactForm request={request} transcript={transcript} onDone={() => { setSent(true); setMsgs((x) => [...x, { role: "model", text: t("تمام ✅ طلبك وصل، وحد من الفريق هيكلّمك قريب.") }]); }} />}
                  {m.offerContact && i === msgs.length - 1 && (
                    <a href={waLink(wa, t("مرحبًا، كنت بكلّم المساعد الذكي في موقع فاليو عقار ومحتاج مساعدة."))} target="_blank" rel="noreferrer"
                      className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-[#128C7E] underline"><WhatsAppMark className="size-4" />{t("أو كلّمنا واتساب")}</a>
                  )}
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
      <button ref={btn} type="button" aria-expanded={open} aria-label={t("فاليو عقار — اسألني")} title={t("اسحبني لأي مكان")}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => { drag.current = null; }}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen((o) => !o); } }}
        style={pos ? { left: pos.x, top: pos.y } : undefined}
        className={`fixed z-40 flex touch-none select-none items-center gap-2 rounded-full bg-primary p-1.5 text-primary-foreground sm:pe-4 shadow-float transition-[transform,box-shadow] hover:scale-[1.03] active:cursor-grabbing ${pos ? "" : "bottom-[calc(5.5rem+env(safe-area-inset-bottom))] ltr:left-4 rtl:right-4 lg:bottom-6"} cursor-grab`}>
        <span className="relative grid size-11 place-items-center rounded-full bg-white/10">
          {open ? <X className="size-5" /> : <Sparkles className="size-5 text-teal" />}
          <span className="absolute -bottom-0.5 size-3 rounded-full border-2 border-primary bg-emerald-400 ltr:-right-0.5 rtl:-left-0.5" />
        </span>
        <span className="hidden text-start leading-tight sm:block">
          <span className="block text-sm font-extrabold">{t("فاليو عقار")}</span>
          <span className="block text-[10px] opacity-75">{t("اسألني · بيرد في ثواني")}</span>
        </span>
      </button>
    </div>
  );
}
