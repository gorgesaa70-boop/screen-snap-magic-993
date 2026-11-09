import { createFileRoute } from "@tanstack/react-router";
import { VIDEO_HINT, parseVideo } from "@/lib/video";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { HousePlus, ShieldCheck, Users, Wallet, ArrowLeft, ImagePlus, X } from "lucide-react";
import { PageShell, Field, inputCls, btnTeal } from "@/components/site/ui";
import { TYPES_FOR, DEFAULT_CITY, FINISHING_LABEL, hasFinishing } from "@/components/site/data";
import { PlacePicker, placeReady, placeToSave } from "@/components/site/PlacePicker";
import { InstallmentFields, emptyInstallments, installmentError, installmentPayload, type InstallmentDraft } from "@/components/site/InstallmentFields";
import { AssignmentFields } from "@/components/site/AssignmentFields";
import { assignmentError, assignmentPayload, emptyAssignment, type AssignmentDraft } from "@/lib/assignment";
import { getAttribution } from "@/lib/attribution";
import { sendWhatsappOtp, submitOwnerListing } from "@/lib/whatsapp-otp.functions";
import { MapPicker, type LatLng } from "@/components/site/MapPicker";
import { t, useLang } from "@/lib/i18n";
import { ARABIC_DIGITS, latinDigit } from "@/lib/digits";
import { WhatsappInbound, type InboundStart } from "@/components/auth/WhatsappInbound";

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
  not_confirmed: "لسه موصلتناش رسالتك على واتساب، ابعت الكود وارجع تاني",
  server: "الطلب ماتبعتش، جرّب تاني",
  bad_photo: "فيه صورة مش مدعومة، جرّب صورة تانية",
  plan_limit: "وصلت لحد باقتك (عدد الإعلانات الظاهرة في نفس الوقت). سجّل دخول برقمك وادخل «إعلاناتي» ← «باقتي» عشان تطلب باقة أكبر.",
  plan_limit_app: "وصلت لحد باقتك (عدد الإعلانات الظاهرة في نفس الوقت). احذف إعلان قديم من «إعلاناتي» عشان تنزّل الجديد.",
  plan_expired: "باقتك خلصت. سجّل دخول برقمك وادخل «إعلاناتي» ← «باقتي» واختار باقة، وإعلاناتك هترجع تظهر.",
  plan_expired_app: "باقتك خلصت، وإعلاناتك مستخبية عن الزوار لحد ما تتجدد (مفيش حاجة اتمسحت).",
  contract_required: "ضيف صورة عقد الوحدة عشان نراجعه",
};

/** Error text for a code; inside the store apps, plan errors don't send people to buy a plan. */
function errorText(code: string) {
  const app = typeof document !== "undefined" && document.documentElement.classList.contains("native-app") ? ERRORS[`${code}_app`] : undefined;
  return app ?? ERRORS[code] ?? ERRORS["server"]!;
}

const MAX_PHOTOS = 6;
const MAX_CONTRACT = 3;

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
  let d = raw.replace(ARABIC_DIGITS, latinDigit).replace(/\D/g, "");
  if (d.startsWith("0020")) d = d.slice(2);
  if (d.startsWith("20")) d = d.slice(2);
  if (d.startsWith("0")) d = d.slice(1);
  return /^1[0125]\d{8}$/.test(d) ? "20" + d : null;
}

const num = (v: string) => (v ? Number(v) : undefined);
/** The server takes missing fields, not nulls. */
const stripNulls = <T extends Record<string, unknown>>(o: T) => Object.fromEntries(Object.entries(o).filter(([, v]) => v != null)) as { [K in keyof T]?: Exclude<T[K], null> };

function SellPage() {
  useLang();
  return (
    <PageShell>
      <section className="bg-primary px-4 py-8 text-primary-foreground md:px-6 md:py-12">
        <div className="mx-auto max-w-3xl">
          <h1 className="flex items-center gap-2 text-2xl font-extrabold md:text-4xl"><HousePlus className="size-7 text-teal md:size-9" />{t("اعرض عقارك")}</h1>
          <p className="mt-2 text-sm text-primary-foreground/80 md:text-base">{t("عندك شقة أو أرض أو محل وعايز تبيعه أو تأجّره؟ ابعت البيانات، وفريق فاليو عقار هيتواصل معاك ويساعدك توصل للمشتري المناسب.")}</p>
          <ul className="mt-5 grid gap-2 text-sm sm:grid-cols-3">
            {[{ I: Wallet, l: "أول إعلانين مجانًا" }, { I: ShieldCheck, l: "بياناتك مش بتظهر للعامة" }, { I: Users, l: "نوصّلك بعملاء جادين" }].map(({ I, l }) => (
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
  const [f, setF] = useState({ video: "", name: "", phone: "", purpose: "sale" as "sale" | "rent" | "summer", price_unit: "night" as "night" | "week" | "month" | "season", property_type: "", finishing: "", city: DEFAULT_CITY, area: "", price: "", size: "", rooms: "", baths: "", floor: "", details: "" });
  const [photos, setPhotos] = useState<{ b64: string; preview: string }[]>([]);
  const [loc, setLoc] = useState<LatLng | null>(null);
  const [compressing, setCompressing] = useState(false);
  const [step, setStep] = useState<"form" | "code" | "inbound" | "done">("form");
  const [inbound, setInbound] = useState<InboundStart | null>(null);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const digits = (k: "price" | "size" | "rooms" | "baths", max = 13) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value.replace(ARABIC_DIGITS, latinDigit).replace(/\D/g, "").slice(0, max) });

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
  const [inst, setInst] = useState<InstallmentDraft>(emptyInstallments);
  // «تنازل»: a sale of an installment contract (purpose stays sale). /sell?asg=1 opens on it.
  const [asg, setAsg] = useState(false);
  const [asgD, setAsgD] = useState<AssignmentDraft>(emptyAssignment);
  const [contract, setContract] = useState<{ b64: string; preview: string }[]>([]);
  useEffect(() => { if (new URLSearchParams(window.location.search).get("asg") === "1") { setAsg(true); setF((x) => ({ ...x, purpose: "sale" })); } }, []);
  async function addContract(e: React.ChangeEvent<HTMLInputElement>) {
    const files = [...(e.target.files ?? [])].filter((x) => x.type.startsWith("image/")).slice(0, MAX_CONTRACT - contract.length);
    e.target.value = "";
    setCompressing(true);
    const out: { b64: string; preview: string }[] = [];
    for (const file of files) { try { out.push(await compressPhoto(file)); } catch { toast.error(t(ERRORS["bad_photo"]!)); } }
    setContract((c) => [...c, ...out].slice(0, MAX_CONTRACT));
    setCompressing(false);
  }

  useEffect(() => {
    if (resendIn <= 0) return;
    const id = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [resendIn]);

  async function save(p: string, withCode?: string, ticket?: string) {
    if (f.video.trim() && !parseVideo(f.video)) { toast.error(t("لينك الفيديو لازم يكون عام من فيسبوك أو تيك توك أو يوتيوب")); return; }
    setBusy(true);
    const attr = getAttribution();
    const r = await submit({ data: {
      name: f.name.trim(), phone: p, ...(withCode ? { code: withCode } : {}), ...(ticket ? { ticket } : {}), purpose: f.purpose, ...(f.purpose === "summer" ? { price_unit: f.price_unit } : {}), property_type: f.property_type,
      ...placeToSave(f), asking_price: Number(f.price), size_m2: Number(f.size),
      ...(f.purpose === "sale" && !asg ? stripNulls(installmentPayload(inst, Number(f.price))) : {}),
      ...(f.purpose === "sale" && asg ? { assignment: stripNulls(assignmentPayload(asgD)), contract: contract.map((x) => x.b64) } : {}),
      ...(hasFinishing(f.property_type) && f.finishing ? { finishing: f.finishing as "skeleton" | "semi" | "full" | "super_lux" } : {}),
      rooms: num(f.rooms), baths: num(f.baths), floor: f.floor.trim() || undefined, details: f.details.trim() || undefined, ...(f.video.trim() ? { video_url: f.video.trim() } : {}),
      photos: photos.map((x) => x.b64), ...(loc ? { lat: loc.lat, lng: loc.lng } : {}), ...(attr ? { utm: attr } : {}),
    } }).catch(() => ({ ok: false as const, error: "server" }));
    setBusy(false);
    if (r.ok) { setStep("done"); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    setCode("");
    if ("remaining" in r && typeof r.remaining === "number") toast.error(`${t("رمز غير صحيح")} (${t("متبقٍ")} ${r.remaining})`);
    else toast.error(t(errorText(r.error)));
  }

  async function requestCode(e?: React.FormEvent) {
    e?.preventDefault();
    const p = egPhone(f.phone);
    if (f.name.trim().length < 2) { toast.error(t("اكتب اسمك")); return; }
    if (!p) { toast.error(t("اكتب رقم موبايل مصري صحيح")); return; }
    if (!f.property_type) { toast.error(t("اختار نوع العقار")); return; }
    if (!placeReady(f)) { toast.error(t("اختار المنطقة / الحي")); return; }
    if (hasFinishing(f.property_type) && !f.finishing) { toast.error(t("اختار حالة التشطيب")); return; }
    if (!Number(f.size)) { toast.error(t("اكتب المساحة")); return; }
    if (!Number(f.price)) { toast.error(t("اكتب السعر")); return; }
    const instErr = f.purpose === "sale" ? (asg ? assignmentError(asgD) : installmentError(inst, Number(f.price))) : "";
    if (instErr) { toast.error(t(instErr)); return; }
    if (photos.length === 0) { toast.error(t("ضيف صورة واحدة على الأقل للعقار")); return; }
    if (f.purpose === "sale" && asg && contract.length === 0) { toast.error(t(ERRORS["contract_required"]!)); return; }
    setPhone(p);
    setBusy(true);
    const r = await send({ data: { phone: p } }).catch(() => ({ ok: false as const, error: "server" }));
    setBusy(false);
    if (r.ok && r.mode === "inbound") { setInbound({ phone: p, code: r.code, ticket: r.ticket, expiresIn: r.expiresIn }); setStep("inbound"); return; }
    if (r.ok) { setStep("code"); setCode(""); setResendIn(60); setTimeout(() => codeRef.current?.focus(), 50); return; }
    // WhatsApp not set up yet: accept the listing without phone verification.
    if (r.error === "not_configured") { await save(p); return; }
    toast.error(t(errorText(r.error)));
  }

  useEffect(() => { if (step === "code" && code.length === 6 && !busy) save(phone, code); }, [code]); // eslint-disable-line react-hooks/exhaustive-deps

  if (step === "done") {
    return (
      <div className="rounded-2xl border bg-card p-8 text-center shadow-card">
        <p className="text-xl font-extrabold text-primary">{t("عقارك وصلنا ✓")}</p>
        <p className="mt-2 text-sm text-muted-foreground">{t("فريق فاليو عقار هيراجع الإعلان، وأول ما يتوافق عليه هينزل على الموقع. هنتواصل معاك على واتساب لو احتجنا أي حاجة.")}</p>
        <p className="mt-2 text-sm text-muted-foreground">{t("تقدر تتابع إعلانك وتجدّده من «إعلاناتي» لما تسجّل دخول بنفس رقم الموبايل.")}</p>
        <a href="/" className={`${btnTeal} mt-6`}>{t("الرجوع للرئيسية")}</a>
      </div>
    );
  }

  if (step === "inbound" && inbound) {
    return (
      <div className="rounded-2xl border bg-card p-5 shadow-card">
        <WhatsappInbound start={inbound} busy={busy} onConfirmed={(ticket) => save(phone, undefined, ticket)} onBack={() => setStep("form")} onRestart={() => requestCode()} />
      </div>
    );
  }

  if (step === "code") {
    return (
      <form onSubmit={(e) => { e.preventDefault(); if (/^\d{6}$/.test(code)) save(phone, code); }} className="space-y-4 rounded-2xl border bg-card p-5 shadow-card">
        <p className="text-sm text-foreground/80">{t("بعتنالك رمز من 6 أرقام على واتساب للرقم")} <span dir="ltr" className="font-bold">+{phone}</span></p>
        <Field label={t("رمز التحقق")}>
          <input ref={codeRef} className={`${inputCls} text-center text-lg tracking-[0.5em]`} dir="ltr" inputMode="numeric" autoComplete="one-time-code"
            value={code} onChange={(e) => setCode(e.target.value.replace(ARABIC_DIGITS, latinDigit).replace(/\D/g, "").slice(0, 6))} disabled={busy} />
        </Field>
        <button disabled={busy || code.length !== 6} className={`${btnTeal} w-full`}>{busy ? t("بيتبعت...") : t("تأكيد وإرسال")}</button>
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
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup">
          {(["sale", "tanazul", "rent", "summer"] as const).map((p) => {
            const on = p === "tanazul" ? f.purpose === "sale" && asg : p === "sale" ? f.purpose === "sale" && !asg : f.purpose === p;
            return (
              <button key={p} type="button" role="radio" aria-checked={on} onClick={() => { setAsg(p === "tanazul"); setF({ ...f, purpose: p === "tanazul" ? "sale" : p }); }}
                className={`h-11 rounded-xl border text-sm font-bold transition ${on ? "border-teal bg-teal/10 text-primary" : "border-border text-muted-foreground hover:border-teal/50"}`}>
                {p === "sale" ? t("أبيع") : p === "tanazul" ? t("أتنازل عن وحدة") : p === "rent" ? t("أأجّر شهري") : t("أأجّر مصيف")}
              </button>
            );
          })}
        </div>
        {asg && f.purpose === "sale" && <p className="mt-2 text-xs text-muted-foreground">{t("تنازل يعني وحدة لسه بالتقسيط مع المطور، وعايز حد يكمل مكانك ويدفعلك اللي دفعته.")}</p>}
      </div>
      <Field label={t("نوع العقار")}>
        <select className={inputCls} value={f.property_type} onChange={set("property_type")} required>
          <option value="">{t("اختر")}</option>{TYPES_FOR[f.purpose === "sale" ? "بيع" : f.purpose === "rent" ? "إيجار" : "مصيف"]!.map((v) => <option key={v} value={v}>{t(v)}</option>)}
        </select>
      </Field>
      <PlacePicker translate city={f.city} area={f.area} onChange={(v) => setF({ ...f, ...v })} />
      {hasFinishing(f.property_type) && (
        <Field label={t("حالة التشطيب")}>
          <select className={inputCls} value={f.finishing} onChange={set("finishing")}>
            <option value="">{t("اختر")}</option>{Object.entries(FINISHING_LABEL).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}
          </select>
        </Field>
      )}
      <Field label={t(f.property_type === "بيت" || f.property_type === "عمارة" ? "مساحة الأرض (م²)" : "المساحة (م²)")}>
        <input className={inputCls} inputMode="numeric" dir="ltr" value={f.size} onChange={digits("size")} placeholder="120" />
      </Field>
      <Field label={f.purpose === "sale" ? t(asg ? "مبلغ التنازل المطلوب (ج.م)" : "السعر المطلوب (ج.م)") : f.purpose === "rent" ? t("الإيجار الشهري (ج.م)") : t("السعر (ج.م)")}>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input className={`${inputCls} min-w-0 text-lg sm:flex-1`} inputMode="numeric" dir="ltr" value={f.price} onChange={digits("price")} placeholder={f.purpose === "summer" ? "1500" : f.purpose === "rent" ? "8000" : "1500000"} required />
          {f.purpose === "summer" && (
            <select aria-label={t("السعر لكل")} className={`${inputCls} sm:w-40 sm:shrink-0`} value={f.price_unit} onChange={(e) => setF({ ...f, price_unit: e.target.value as typeof f.price_unit })}>
              <option value="night">{t("الليلة")}</option><option value="week">{t("الأسبوع")}</option><option value="month">{t("الشهر")}</option><option value="season">{t("الموسم")}</option>
            </select>
          )}
        </div>
      </Field>
      {f.purpose === "sale" && !asg && <InstallmentFields translate value={inst} onChange={setInst} price={Number(f.price || 0)} />}
      {f.purpose === "sale" && asg && (
        <>
          <p className="-mt-2 text-xs text-muted-foreground sm:col-span-2">{t("مبلغ التنازل هو اللي المشتري هيدفعه ليك دلوقتي، والباقي بيكمّله مع المطور.")}</p>
          <AssignmentFields translate value={asgD} onChange={setAsgD} />
          <div className="sm:col-span-2">
            <span className="mb-1.5 block text-sm font-bold text-primary">{t("صورة العقد")} <span className="font-normal text-muted-foreground">({contract.length}/{MAX_CONTRACT})</span></span>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {contract.map((p, i) => (
                <div key={i} className="relative aspect-square overflow-hidden rounded-xl border bg-muted">
                  <img src={p.preview} alt="" className="size-full object-cover" />
                  <button type="button" onClick={() => setContract((x) => x.filter((_, j) => j !== i))} aria-label={t("حذف الصورة")} className="absolute top-1 end-1 grid size-7 place-items-center rounded-full bg-background/90 text-primary shadow"><X className="size-4" /></button>
                </div>
              ))}
              {contract.length < MAX_CONTRACT && (
                <label className={`grid aspect-square cursor-pointer place-items-center rounded-xl border-2 border-dashed text-center text-xs font-bold text-primary transition hover:border-teal ${compressing ? "opacity-60" : ""}`}>
                  <span className="flex flex-col items-center gap-1"><ImagePlus className="size-6 text-teal" />{t("صور العقد")}</span>
                  <input type="file" accept="image/*" multiple className="sr-only" onChange={addContract} disabled={compressing} />
                </label>
              )}
            </div>
            <p className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><ShieldCheck className="size-4 shrink-0 text-teal" />{t("صورة العقد بيشوفها فريق فاليو عقار بس للمراجعة، ومش بتظهر في الإعلان.")}</p>
          </div>
        </>
      )}
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
      <div className="sm:col-span-2">
        <Field label={t("حدد موقع عقارك على الخريطة — اختياري")}>
          <MapPicker value={loc} onChange={setLoc} />
        </Field>
        <p className="mt-1.5 text-xs text-muted-foreground">{t("دوس على مكان العقار في الخريطة، أو «موقعي الحالي» لو إنت في العقار دلوقتي.")}</p>
      </div>
      <Field label={t("تفاصيل إضافية")}>
        <textarea className={`${inputCls} h-24 py-2`} value={f.details} onChange={set("details")} maxLength={1000} placeholder={t("الدور، التشطيب، عدد الغرف...")} />
      </Field>
      <Field label={t("لينك فيديو (اختياري)")}>
        <input className={inputCls} dir="ltr" inputMode="url" maxLength={500} placeholder="https://" value={f.video} onChange={set("video")} />
        <span className="mt-1 block text-xs font-normal text-muted-foreground">{t(VIDEO_HINT)}</span>
      </Field>
      <div className="grid gap-4 border-t pt-4 sm:col-span-2 sm:grid-cols-2">
        <Field label={t("الاسم")}>
          <input className={inputCls} value={f.name} onChange={set("name")} maxLength={100} required autoComplete="name" />
        </Field>
        <Field label={t("رقم الموبايل (واتساب)")}>
          <input className={inputCls} inputMode="tel" dir="ltr" value={f.phone} onChange={set("phone")} maxLength={20} required placeholder="01xxxxxxxxx" autoComplete="tel" />
        </Field>
      </div>
      <button disabled={busy || compressing} className={`${btnTeal} h-12 sm:col-span-2`}>{busy ? t("بيتبعت...") : t("ابعت بيانات العقار")} <ArrowLeft className="size-4" /></button>
      <p className="text-xs text-muted-foreground sm:col-span-2">{t("هتبعتلنا كود على واتساب من رقمك للتأكد منه. رقمك مش هيظهر لحد غير فريق فاليو عقار.")}</p>
    </form>
  );
}
