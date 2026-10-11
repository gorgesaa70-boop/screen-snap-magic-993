import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { HousePlus, ShieldCheck, Users, Wallet, ArrowLeft, ImagePlus, X } from "lucide-react";
import { PageShell, Field, inputCls, btnTeal } from "@/components/site/ui";
import { TYPES_FOR, CITIES, DEFAULT_CITY } from "@/components/site/data";
import { sendWhatsappOtp, submitOwnerListing } from "@/lib/whatsapp-otp.functions";
import { t, useLang } from "@/lib/i18n";

export const Route = createFileRoute("/sell")({
  head: () => ({
    links: [{ rel: "canonical", href: "https://valueaqar.com/sell" }],
    meta: [
      { title: "اعرض عقارك للبيع أو الإيجار | فاليو عقار" },
      { name: "description", content: "اعرض شقتك أو أرضك أو محلك للبيع أو الإيجار في برج العرب، وفريق فاليو عقار يتواصل معك." },
      { property: "og:title", content: "اعرض عقارك للبيع أو الإيجار | فاليو عقار" },
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
  bad_photo: "فيه صورة مش مدعومة، جرّب صورة تانية",
};

const MAX_PHOTOS = 6;

/** Resize to at most 1600px and re-encode as JPEG so uploads stay small; returns base64 without the prefix. */
async function compressPhoto(file: File): Promise<{ b64: string; preview: string }> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  const preview = canvas.toDataURL("image/jpeg", 0.8);
  return { b64: preview.slice(preview.indexOf(",") + 1), preview };
}

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
          <h1 className="flex items-center gap-2 text-2xl font-extrabold md:text-4xl"><HousePlus className="size-7 text-teal md:size-9" />{t("اعرض عقارك")}</h1>
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
  const [f, setF] = useState({ name: "", phone: "", purpose: "sale" as "sale" | "rent" | "summer", price_unit: "night" as "night" | "week" | "month" | "season", property_type: "", city: DEFAULT_CITY, area: "", price: "", size: "", rooms: "", baths: "", floor: "", details: "" });
  const [photos, setPhotos] = useState<{ b64: string; preview: string }[]>([]);
  const [compressing, setCompressing] = useState(false);
  const [step, setStep] = useState<"form" | "code" | "done">("form");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const digits = (k: "price" | "size" | "rooms" | "baths", max = 13) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value.replace(/\D/g, "").slice(0, max) });

  async function addPhotos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = [...(e.target.files ?? [])].filter((x) => x.type.startsWith("image/"));
    e.target.value = "";
    const room = MAX_PHOTOS - photos.length;
    if (files.length > room) toast.error(t("أقصى عدد {n} صور", { n: MAX_PHOTOS }));
    setCompressing(true);
    const out: { b64: string; preview: string }[] = [];
    for (const file of files.slice(0, room)) {
      try { out.push(await compressPhoto(file)); } catch { toast.error(t(ERRORS["bad_photo"]!)); }
    }
    setPhotos((p) => [...p, ...out].slice(0, MAX_PHOTOS));
    setCompressing(false);
  }
  const areas = CITIES[f.city] ?? [];

  useEffect(() => {
    if (resendIn <= 0) return;
    const id = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [resendIn]);

  async function save(p: string, withCode?: string) {
    setBusy(true);
    const r = await submit({ data: {
      name: f.name.trim(), phone: p, ...(withCode ? { code: withCode } : {}), purpose: f.purpose, ...(f.purpose === "summer" ? { price_unit: f.price_unit } : {}), property_type: f.property_type,
      city: f.city, area: f.area || f.city, asking_price: Number(f.price), size_m2: Number(f.size),
      rooms: num(f.rooms), baths: num(f.baths), floor: f.floor.trim() || undefined, details: f.details.trim() || undefined,
      photos: photos.map((x) => x.b64),
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
    if (areas.length > 0 && !f.area) { toast.error(t("اختر المنطقة / الحي")); return; }
    if (!Number(f.size)) { toast.error(t("اكتب المساحة")); return; }
    if (!Number(f.price)) { toast.error(t("اكتب السعر")); return; }
    if (photos.length === 0) { toast.error(t("ضيف صورة واحدة على الأقل للعقار")); return; }
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
        <p className="mt-2 text-sm text-muted-foreground">{t("فريق فاليو عقار هيراجع الإعلان، وأول ما يتوافق عليه هينزل على الموقع. هنتواصل معاك على واتساب لو احتجنا أي حاجة.")}</p>
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
        <div className="grid grid-cols-3 gap-2" role="radiogroup">
          {(["sale", "rent", "summer"] as const).map((p) => (
            <button key={p} type="button" role="radio" aria-checked={f.purpose === p} onClick={() => setF({ ...f, purpose: p })}
              className={`h-11 rounded-xl border text-sm font-bold transition ${f.purpose === p ? "border-teal bg-teal/10 text-primary" : "border-border text-muted-foreground hover:border-teal/50"}`}>
              {p === "sale" ? t("أبيع") : p === "rent" ? t("أأجّر شهري") : t("أأجّر مصيف")}
            </button>
          ))}
        </div>
      </div>
      <Field label={t("نوع العقار")}>
        <select className={inputCls} value={f.property_type} onChange={set("property_type")} required>
          <option value="">{t("اختر")}</option>{TYPES_FOR[f.purpose === "sale" ? "بيع" : f.purpose === "rent" ? "إيجار" : "مصيف"]!.map((v) => <option key={v} value={v}>{t(v)}</option>)}
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
      <Field label={f.purpose === "sale" ? t("السعر المطلوب (ج.م)") : f.purpose === "rent" ? t("الإيجار الشهري (ج.م)") : t("السعر (ج.م)")}>
        <div className="flex gap-2">
          <input className={inputCls} inputMode="numeric" dir="ltr" value={f.price} onChange={digits("price")} required />
          {f.purpose === "summer" && (
            <select aria-label={t("السعر لكل")} className={`${inputCls} w-36 shrink-0`} value={f.price_unit} onChange={(e) => setF({ ...f, price_unit: e.target.value as typeof f.price_unit })}>
              <option value="night">{t("الليلة")}</option><option value="week">{t("الأسبوع")}</option><option value="month">{t("الشهر")}</option><option value="season">{t("الموسم")}</option>
            </select>
          )}
        </div>
      </Field>
      {!["أرض", "محل", "مكتب"].includes(f.property_type) && (
        <>
          <Field label={t("عدد الغرف")}>
            <input className={inputCls} inputMode="numeric" dir="ltr" value={f.rooms} onChange={digits("rooms", 2)} placeholder={t("اختياري")} />
          </Field>
          <Field label={t("عدد الحمامات")}>
            <input className={inputCls} inputMode="numeric" dir="ltr" value={f.baths} onChange={digits("baths", 2)} placeholder={t("اختياري")} />
          </Field>
        </>
      )}
      {f.property_type !== "أرض" && (
        <Field label={t("الدور")}>
          <input className={inputCls} value={f.floor} onChange={set("floor")} maxLength={50} placeholder={t("اختياري")} />
        </Field>
      )}
      <div className="sm:col-span-2">
        <span className="mb-1.5 block text-sm font-bold text-primary">{t("صور العقار")} <span className="font-normal text-muted-foreground">({photos.length}/{MAX_PHOTOS})</span></span>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {photos.map((p, i) => (
            <div key={i} className="relative aspect-square overflow-hidden rounded-xl border bg-muted">
              <img src={p.preview} alt="" className="size-full object-cover" />
              {i === 0 && <span className="absolute bottom-1 start-1 rounded-full bg-primary/85 px-2 py-0.5 text-[10px] font-bold text-primary-foreground">{t("الرئيسية")}</span>}
              <button type="button" onClick={() => setPhotos((x) => x.filter((_, j) => j !== i))} aria-label={t("حذف الصورة")}
                className="absolute top-1 end-1 grid size-7 place-items-center rounded-full bg-background/90 text-primary shadow"><X className="size-4" /></button>
            </div>
          ))}
          {photos.length < MAX_PHOTOS && (
            <label className={`grid aspect-square cursor-pointer place-items-center rounded-xl border-2 border-dashed text-center text-xs font-bold text-primary transition hover:border-teal ${compressing ? "opacity-60" : ""}`}>
              <span className="flex flex-col items-center gap-1"><ImagePlus className="size-6 text-teal" />{compressing ? t("جارٍ التجهيز...") : t("ضيف صور")}</span>
              <input type="file" accept="image/*" multiple className="sr-only" onChange={addPhotos} disabled={compressing} />
            </label>
          )}
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">{t("أول صورة هتبقى الصورة الرئيسية للإعلان. الصور بتتصغّر تلقائيًا.")}</p>
      </div>
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
      <button disabled={busy || compressing} className={`${btnTeal} h-12 sm:col-span-2`}>{busy ? t("جارٍ الإرسال...") : t("ابعت بيانات العقار")} <ArrowLeft className="size-4" /></button>
      <p className="text-xs text-muted-foreground sm:col-span-2">{t("هنبعتلك رمز تحقق على واتساب للتأكد من رقمك. رقمك مش هيظهر لحد غير فريق فاليو عقار.")}</p>
    </form>
  );
}
