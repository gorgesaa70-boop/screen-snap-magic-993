import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getAttribution } from "@/lib/attribution";
import { cleanPhone } from "@/lib/phone";
import { ARABIC_DIGITS, latinDigit } from "@/lib/digits";
import { t as tr, useLang } from "@/lib/i18n";
import { TYPES_FOR, CITIES, CITY_NAMES, useLocations } from "./data";
import { inputCls } from "./ui";
import { trackMeta } from "@/lib/meta-pixel";

/** The search sends a typed place here so «اطلب عقارك» starts with it. */
export const REQUEST_PLACE_EVENT = "va-request-place";

export function RequestForm({ onSent }: { onSent?: () => void }) {
  useLocations();
  useLang();
  const [f, setF] = useState({ name: "", phone: "", purpose: "sale" as "sale" | "rent" | "summer", property_type: "", city: "", area: "", budget: "", details: "" });
  const [typed, setTyped] = useState(false);
  useEffect(() => {
    const onPlace = (e: Event) => { const place = String((e as CustomEvent).detail ?? "").slice(0, 60); setTyped(true); setF((x) => ({ ...x, city: place, area: "" })); };
    window.addEventListener(REQUEST_PLACE_EVENT, onPlace);
    return () => window.removeEventListener(REQUEST_PLACE_EVENT, onPlace);
  }, []);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (f.name.trim().length < 2 || !cleanPhone(f.phone)) { toast.error(tr("اكتب الاسم ورقم هاتف صحيح")); return; }
    if (!f.property_type && !f.city.trim() && !f.area.trim()) { toast.error(tr("اختار نوع العقار أو المدينة")); return; }
    setBusy(true);
    const { error } = await supabase.from("leads").insert({ name: f.name.trim(), phone: cleanPhone(f.phone)!, kind: "request", purpose: f.purpose, property_type: f.property_type || null, area: (f.area.trim() && f.city.trim() ? `${f.area.trim()}، ${f.city.trim()}` : f.area.trim() || f.city.trim()).slice(0, 60) || null, budget: f.budget ? Number(f.budget) : null, details: f.details.trim().slice(0, 1000) || null, wanted_public: true, original_source: "website", utm: getAttribution() });
    if (!error) trackMeta("Lead");
    setBusy(false);
    if (error) { toast.error(tr("الطلب ماتبعتش، جرّب تاني")); return; }
    setDone(true);
    onSent?.();
  }
  if (done) return <div className="rounded-2xl bg-card p-6 text-center"><p className="text-lg font-bold text-primary">{tr("طلبك وصل ✓")}</p><p className="mt-2 text-sm text-muted-foreground">{tr("سيتواصل معك أحد وسطائنا قريبًا.")}</p><p className="mt-2 text-xs text-muted-foreground">{tr("طلبك هيظهر في صفحة المطلوب من غير اسمك ورقمك.")}</p></div>;
  return (
    <form onSubmit={submit} className="grid gap-2.5 rounded-2xl bg-card p-4 sm:grid-cols-2 md:p-5">
      <input className={inputCls} placeholder={tr("الاسم")} value={f.name} onChange={set("name")} maxLength={100} required />
      <input className={inputCls} placeholder={tr("رقم الهاتف")} inputMode="tel" dir="ltr" value={f.phone} onChange={set("phone")} maxLength={20} required />
      <div role="radiogroup" aria-label={tr("الغرض")} className="grid grid-cols-3 gap-1.5 sm:col-span-2">
        {([["sale", "شراء"], ["rent", "إيجار"], ["summer", "مصيف"]] as const).map(([v, l]) => (
          <button key={v} type="button" role="radio" aria-checked={f.purpose === v} onClick={() => setF({ ...f, purpose: v })}
            className={`h-10 rounded-xl border text-sm font-bold transition ${f.purpose === v ? "border-teal bg-teal/10 text-primary" : "text-muted-foreground hover:border-teal/50"}`}>{tr(l)}</button>
        ))}
      </div>
      <select aria-label={tr("نوع العقار")} className={`${inputCls} sm:col-span-2`} value={f.property_type} onChange={set("property_type")}><option value="">{tr("نوع العقار")}</option>{TYPES_FOR[f.purpose === "sale" ? "بيع" : f.purpose === "rent" ? "إيجار" : "مصيف"]!.map((v) => <option key={v} value={v}>{tr(v)}</option>)}</select>
      <select className={inputCls} value={typed ? "__other__" : f.city} aria-label={tr("المدينة")} onChange={(e) => {
        const other = e.target.value === "__other__";
        setTyped(other); setF({ ...f, city: other ? "" : e.target.value, area: "" });
      }}><option value="">{tr("المدينة")}</option>{CITY_NAMES.map((v) => <option key={v} value={v}>{tr(v)}</option>)}<option value="__other__">{tr("مدينة تانية…")}</option></select>
      {typed ? (
        <input className={inputCls} placeholder={tr("اكتب المدينة")} value={f.city} onChange={set("city")} maxLength={40} aria-label={tr("المدينة")} />
      ) : (
        <select className={inputCls} value={f.area} onChange={set("area")} aria-label={tr("المنطقة")} disabled={!CITIES[f.city]?.length}><option value="">{tr("المنطقة")}</option>{(CITIES[f.city] ?? []).map((v) => <option key={v} value={v}>{tr(v)}</option>)}</select>
      )}
      {typed && <input className={`${inputCls} sm:col-span-2`} placeholder={tr("المنطقة (اختياري)")} value={f.area} onChange={set("area")} maxLength={40} aria-label={tr("المنطقة")} />}
      <input className={`${inputCls} sm:col-span-2`} placeholder={tr(f.purpose === "rent" ? "الميزانية الشهرية (ج.م)" : f.purpose === "summer" ? "الميزانية لليلة (ج.م)" : "الميزانية (ج.م)")} inputMode="numeric" value={f.budget} onChange={(e) => setF({ ...f, budget: e.target.value.replace(ARABIC_DIGITS, latinDigit).replace(/\D/g, "") })} />
      <textarea className={`${inputCls} h-20 py-2 sm:col-span-2`} placeholder={tr("تفاصيل إضافية")} value={f.details} onChange={set("details")} maxLength={1000} />
      <p className="text-xs text-muted-foreground sm:col-span-2">{tr("طلبك هيظهر في صفحة المطلوب من غير اسمك ورقمك وتفاصيلك.")}</p>
      <button disabled={busy} className="flex h-12 items-center justify-center gap-2 rounded-xl bg-teal font-bold text-accent-foreground transition hover:brightness-95 disabled:opacity-60 sm:col-span-2">{busy ? tr("بيتبعت...") : tr("ابعت طلبك")} <ArrowLeft className="size-4" /></button>
    </form>
  );
}
