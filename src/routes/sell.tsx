import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { HousePlus, ShieldCheck, Users, Wallet, ArrowLeft } from "lucide-react";
import { PageShell, Field, inputCls, btnTeal } from "@/components/site/ui";
import { TYPES, CITIES, DEFAULT_CITY } from "@/components/site/data";
import { sendWhatsappOtp, submitOwnerListing } from "@/lib/whatsapp-otp.functions";
import { t, useLang } from "@/lib/i18n";

export const Route = createFileRoute("/sell")({
  head: () => ({
    links: [{ rel: "canonical", href: "https://valueaqar.com/sell" }],
    meta: [
      { title: "بيع عقارك | فاليو عقار" },
      { name: "description", content: "اعرض شقتك أو أرضك أو محلك للبيع أو الإيجار في برج العرب، وفريق فاليو عقار يتواصل معك." },
      { property: "og:title", content: "بيع عقارك | فاليو عقار" },
      { property: "og:url", content: "https://valueaqar.com/sell" },
      { property: "og:description", content: "اعرض عقارك للبيع أو الإيجار بسهولة من خلال فاليو عقار." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SellPage,
});

const ERRORS: Record<string, string> = {
  too_soon: "انتظر قليلًا قبل طلب رمز جديد",
  rate_limited: "تجاوزت عدد مرات الإرسال المسموح، حاول لاحقًا",
  send_failed: "تعذّر إرسال الرسالة عبر واتساب، تأكد أن الرقم مسجّل على واتساب",
  code_required: "أدخل رمز التحقق المرسل على واتساب",
  expired: "انتهت صلاحية الرمز، اطلب رمزًا جديدًا",
  locked: "تم إيقاف الرمز بعد محاولات كثيرة، اطلب رمزًا جديدًا",
  wrong: "رمز غير صحيح",
  server: "تعذّر إرسال الطلب، حاول مرة أخرى",
};

/** Egyptian mobile -> 20XXXXXXXXXX, or null. */
function egPhone(raw: string) {
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("0020")) d = d.slice(2);
  if (d.startsWith("20")) d = d.slice(2);
  if (d.startsWith("0")) d = d.slice(1);
  return /^1[0125]\d{8}$/.test(d) ? "20" + d : null;
}

const num = (v: string) => (v ? Number(v) : undefined);

function SellPage() {
  useLang();
  return (
    <PageShell>
      <section className="bg-primary px-4 py-8 text-primary-foreground md:px-6 md:py-12">
        <div className="mx-auto max-w-3xl">
          <h1 className="flex items-center gap-2 text-2xl font-extrabold md:text-4xl"><HousePlus className="size-7 text-teal md:size-9" />{t("بيع عقارك")}</h1>
          <p className="mt-2 text-sm text-primary-foreground/80 md:text-base">{t("عندك شقة أو أرض أو محل وعايز تبيعه أو تأجّره؟ ابعت البيانات، وفريق فاليو عقار هيتواصل معاك ويساعدك توصل للمشتري المناسب.")}</p>
          <ul className="mt-5 grid gap-2 text-sm sm:grid-cols-3">
            {[{ I: Wallet, l: "مجانًا بدون رسوم عرض" }, { I: ShieldCheck, l: "بياناتك مش بتظهر للعامة" }, { I: Users, l: "نوصّلك بعملاء جادين" }].map(({ I, l }) => (
              <li key={l} className="flex items-center gap-2 rounded-xl bg-primary-foreground/10 px-3 py-2.5 font-semibold"><I className="size-4 shrink-0 text-teal" />{t(l)}</li>
            ))}
          </ul>
        </div>
      </section>
      <div className="mx-auto max-w-3xl px-4 pt-6 md:px-6">
        <SellForm />
      </div>
    </PageShell>
  );
}

function SellForm() {
  useLang();
  const send = useServerFn(sendWhatsappOtp);
  const submit = useServerFn(submitOwnerListing);
  const [f, setF] = useState({ name: "", phone: "", purpose: "sale" as "sale" | "rent", property_type: "", city: DEFAULT_CITY, area: "", price: "", size: "", details: "" });
  const [step, setStep] = useState<"form" | "code" | "done">("form");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const digits = (k: "price" | "size") => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value.replace(/\D/g, "").slice(0, 13) });
  const areas = CITIES[f.city] ?? [];

  useEffect(() => {
    if (resendIn <= 0) return;
    const id = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [resendIn]);

  async function save(p: string, withCode?: string) {
    setBusy(true);
    const r = await submit({ data: {
      name: f.name.trim(), phone: p, ...(withCode ? { code: withCode } : {}), purpose: f.purpose, property_type: f.property_type,
      area: f.area ? `${f.city} - ${f.area}` : f.city, asking_price: num(f.price), size_m2: num(f.size), details: f.details.trim() || undefined,
    } }).catch(() => ({ ok: false as const, error: "server" }));
    setBusy(false);
    if (r.ok) { setStep("done"); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    setCode("");
    if ("remaining" in r && typeof r.remaining === "number") toast.error(`${t("رمز غير صحيح")} (${t("متبقٍ")} ${r.remaining})`);
    else toast.error(t(ERRORS[r.error] ?? ERRORS["server"]!));
  }

  async function requestCode(e?: React.FormEvent) {
    e?.preventDefault();
    const p = egPhone(f.phone);
    if (f.name.trim().length < 2) { toast.error(t("اكتب اسمك")); return; }
    if (!p) { toast.error(t("اكتب رقم موبايل مصري صحيح")); return; }
    if (!f.property_type) { toast.error(t("اختر نوع العقار")); return; }
    setPhone(p);
    setBusy(true);
    const r = await send({ data: { phone: p } }).catch(() => ({ ok: false as const, error: "server" }));
    setBusy(false);
    if (r.ok) { setStep("code"); setCode(""); setResendIn(60); setTimeout(() => codeRef.current?.focus(), 50); return; }
    // WhatsApp not set up yet: accept the listing without phone verification.
    if (r.error === "not_configured") { await save(p); return; }
    toast.error(t(ERRORS[r.error] ?? ERRORS["server"]!));
  }

  useEffect(() => { if (step === "code" && code.length === 6 && !busy) save(phone, code); }, [code]); // eslint-disable-line react-hooks/exhaustive-deps

  if (step === "done") {
    return (
      <div className="rounded-2xl border bg-card p-8 text-center shadow-card">
        <p className="text-xl font-extrabold text-primary">{t("تم استلام عقارك ✓")}</p>
        <p className="mt-2 text-sm text-muted-foreground">{t("فريق فاليو عقار هيراجع البيانات ويتواصل معاك على واتساب قريب.")}</p>
        <a href="/" className={`${btnTeal} mt-6`}>{t("الرجوع للرئيسية")}</a>
      </div>
    );
  }

  if (step === "code") {
    return (
      <form onSubmit={(e) => { e.preventDefault(); if (/^\d{6}$/.test(code)) save(phone, code); }} className="space-y-4 rounded-2xl border bg-card p-5 shadow-card">
        <p className="text-sm text-foreground/80">{t("بعتنالك رمز من 6 أرقام على واتساب للرقم")} <span dir="ltr" className="font-bold">+{phone}</span></p>
        <Field label={t("رمز التحقق")}>
          <input ref={codeRef} className={`${inputCls} text-center text-lg tracking-[0.5em]`} dir="ltr" inputMode="numeric" autoComplete="one-time-code"
            value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} disabled={busy} />
        </Field>
        <button disabled={busy || code.length !== 6} className={`${btnTeal} w-full`}>{busy ? t("جارٍ الإرسال...") : t("تأكيد وإرسال")}</button>
        <div className="flex items-center justify-between text-sm">
          <button type="button" className="font-bold text-primary disabled:text-muted-foreground" disabled={busy || resendIn > 0} onClick={() => requestCode()}>
            {resendIn > 0 ? `${t("إعادة الإرسال بعد")} ${resendIn}` : t("إعادة إرسال الرمز")}
          </button>
          <button type="button" className="font-bold text-primary" onClick={() => setStep("form")}>{t("تعديل البيانات")}</button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={requestCode} className="grid gap-4 rounded-2xl border bg-card p-5 shadow-card sm:grid-cols-2">
      <div className="sm:col-span-2">
        <span className="mb-1.5 block text-sm font-bold text-primary">{t("عايز")}</span>
        <div className="grid grid-cols-2 gap-2" role="radiogroup">
          {(["sale", "rent"] as const).map((p) => (
            <button key={p} type="button" role="radio" aria-checked={f.purpose === p} onClick={() => setF({ ...f, purpose: p })}
              className={`h-11 rounded-xl border text-sm font-bold transition ${f.purpose === p ? "border-teal bg-teal/10 text-primary" : "border-border text-muted-foreground hover:border-teal/50"}`}>
              {p === "sale" ? t("أبيع") : t("أأجّر")}
            </button>
          ))}
        </div>
      </div>
      <Field label={t("نوع العقار")}>
        <select className={inputCls} value={f.property_type} onChange={set("property_type")} required>
          <option value="">{t("اختر")}</option>{TYPES.map((v) => <option key={v} value={v}>{t(v)}</option>)}
        </select>
      </Field>
      <Field label={t("المدينة")}>
        <select className={inputCls} value={f.city} onChange={(e) => setF({ ...f, city: e.target.value, area: "" })}>
          {Object.keys(CITIES).map((c) => <option key={c} value={c}>{t(c)}</option>)}
        </select>
      </Field>
      {areas.length > 0 && (
        <Field label={t("المنطقة / الحي")}>
          <select className={inputCls} value={f.area} onChange={set("area")}>
            <option value="">{t("اختر")}</option>{areas.map((a) => <option key={a} value={a}>{t(a)}</option>)}
          </select>
        </Field>
      )}
      <Field label={t("المساحة (م²)")}>
        <input className={inputCls} inputMode="numeric" dir="ltr" value={f.size} onChange={digits("size")} placeholder="120" />
      </Field>
      <Field label={f.purpose === "sale" ? t("السعر المطلوب (ج.م)") : t("الإيجار الشهري (ج.م)")}>
        <input className={inputCls} inputMode="numeric" dir="ltr" value={f.price} onChange={digits("price")} placeholder={t("اختياري")} />
      </Field>
      <Field label={t("تفاصيل إضافية")}>
        <textarea className={`${inputCls} h-24 py-2`} value={f.details} onChange={set("details")} maxLength={1000} placeholder={t("الدور، التشطيب، عدد الغرف...")} />
      </Field>
      <div className="grid gap-4 border-t pt-4 sm:col-span-2 sm:grid-cols-2">
        <Field label={t("الاسم")}>
          <input className={inputCls} value={f.name} onChange={set("name")} maxLength={100} required autoComplete="name" />
        </Field>
        <Field label={t("رقم الموبايل (واتساب)")}>
          <input className={inputCls} inputMode="tel" dir="ltr" value={f.phone} onChange={set("phone")} maxLength={20} required placeholder="01xxxxxxxxx" autoComplete="tel" />
        </Field>
      </div>
      <button disabled={busy} className={`${btnTeal} h-12 sm:col-span-2`}>{busy ? t("جارٍ الإرسال...") : t("ابعت بيانات العقار")} <ArrowLeft className="size-4" /></button>
      <p className="text-xs text-muted-foreground sm:col-span-2">{t("هنبعتلك رمز تحقق على واتساب للتأكد من رقمك. رقمك مش هيظهر لحد غير فريق فاليو عقار.")}</p>
    </form>
  );
}
