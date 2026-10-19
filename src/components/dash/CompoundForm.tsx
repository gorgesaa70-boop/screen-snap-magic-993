import { useEffect, useState } from "react";
import { toast } from "sonner";
import { FileSpreadsheet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_CITY, areasOf, uploadImage } from "@/components/site/data";
import { PlacePicker, placeReady, placeToSave } from "@/components/site/PlacePicker";
import { AMENITIES, type CompoundRow } from "@/components/site/compounds";
import { Field, inputCls, btnPrimary, btnOutline } from "@/components/site/ui";
import { MapPicker, type LatLng } from "@/components/site/MapPicker";
import { ARABIC_DIGITS, latinDigit } from "@/lib/digits";
import type { UnitInput } from "@/lib/units-import";
import { UnitsImport } from "./UnitsImport";

type Props = {
  /** Developer adding to their own account. */
  developerId?: string | undefined;
  /** Admin: developer accounts to pick from (empty choice = Value Aqar runs the compound). */
  developers?: { id: string; name: string }[];
  initial?: CompoundRow | null;
  onDone: (id: string) => void;
  onCancel: () => void;
};

const MAX_IMAGES = 12;
const chunks = <T,>(list: T[], size: number) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size));

export function CompoundForm({ developerId, developers, initial, onDone, onCancel }: Props) {
  const admin = !!developers;
  const [f, setF] = useState({
    name: initial?.name ?? "",
    developer_id: initial?.developer_id ?? "",
    developer_name: initial?.developer_name ?? "",
    description: initial?.description ?? "",
    city: initial?.city ?? DEFAULT_CITY,
    area: initial?.area ?? areasOf(initial?.city ?? DEFAULT_CITY)[0]!,
    location: initial?.location ?? "",
    payment_plans: initial?.payment_plans ?? "",
    down_payment_pct: initial?.down_payment_pct != null ? String(initial.down_payment_pct) : "",
    installment_years: initial?.installment_years != null ? String(initial.installment_years) : "",
    delivery_date: initial?.delivery_date ?? "",
    delivery_year: initial?.delivery_year != null ? String(initial.delivery_year) : "",
    amenities: initial?.amenities ?? ([] as string[]),
    images: initial?.images ?? ([] as string[]),
    co_broke_share: initial?.co_broke_share != null ? String(initial.co_broke_share) : "",
  });
  const [loc, setLoc] = useState<LatLng | null>(initial?.lat != null && initial?.lng != null ? { lat: initial.lat, lng: initial.lng } : null);
  const [busy, setBusy] = useState(false);
  // Units from Excel, added right after the compound is saved.
  const [showUnits, setShowUnits] = useState(false);
  const [units, setUnits] = useState<UnitInput[] | null>(null);
  const [codes, setCodes] = useState<string[]>([]);
  useEffect(() => {
    if (!showUnits || !initial) return;
    supabase.from("compound_units").select("code").eq("compound_id", initial.id).then(({ data }) =>
      setCodes((data ?? []).map((u) => u.code).filter((c): c is string => !!c)));
  }, [showUnits, initial]);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const digits = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value.replace(ARABIC_DIGITS, latinDigit).replace(/\D/g, "") });
  const num = (v: string) => (v === "" ? null : Number(v));

  async function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = [...(e.target.files ?? [])].slice(0, MAX_IMAGES - f.images.length);
    e.target.value = "";
    if (!files.length) return;
    setBusy(true);
    for (const file of files) {
      try { const url = await uploadImage(file); setF((x) => ({ ...x, images: [...x.images, url].slice(0, MAX_IMAGES) })); }
      catch (err) { toast.error((err as Error).message); }
    }
    setBusy(false);
  }

  async function save() {
    if (f.name.trim().length < 2) { toast.error("اكتب اسم الكمبوند"); return; }
    if (!placeReady(f)) { toast.error("اختار المدينة والمنطقة، أو اكتب المنطقة الجديدة"); return; }
    const down = num(f.down_payment_pct), years = num(f.installment_years), year = num(f.delivery_year);
    if (down != null && down > 100) { toast.error("المقدم نسبة من 0 لـ 100"); return; }
    if (years != null && years > 30) { toast.error("سنين التقسيط لحد 30"); return; }
    if (year != null && (year < 2000 || year > 2100)) { toast.error("سنة الاستلام مش مظبوطة"); return; }
    const share = f.co_broke_share === "" ? null : Number(f.co_broke_share);
    if (share != null && (!(share > 0) || share > 90)) { toast.error("نسبة قسمة الوسطاء من 1 لـ 90"); return; }
    setBusy(true);
    const payload = {
      name: f.name.trim().slice(0, 120), description: f.description.trim().slice(0, 2000) || null,
      ...placeToSave(f),
      location: f.location.trim().slice(0, 300) || null, payment_plans: f.payment_plans.trim().slice(0, 2000) || null,
      down_payment_pct: down, installment_years: years, delivery_date: f.delivery_date.trim().slice(0, 100) || null, delivery_year: year,
      amenities: f.amenities, images: f.images, logo_url: f.images[0] ?? null,
      lat: loc?.lat ?? null, lng: loc?.lng ?? null,
      ...(share != null || initial?.co_broke_share != null ? { co_broke_share: share } : {}),
      ...(admin ? { developer_id: f.developer_id || null, developer_name: f.developer_id ? null : f.developer_name.trim().slice(0, 150) || null } : {}),
    };
    const res = initial
      ? await supabase.from("compounds").update(payload).eq("id", initial.id).select("id").single()
      : await supabase.from("compounds").insert({ ...payload, ...(admin ? {} : { developer_id: developerId! }) }).select("id").single();
    if (res.error) { setBusy(false); toast.error(res.error.message); return; }
    const id = res.data.id;
    let added = 0;
    for (const chunk of chunks(units ?? [], 200)) {
      const { error } = await supabase.from("compound_units").insert(chunk.map((u) => ({ ...u, compound_id: id })));
      if (error) {
        toast.error(`الكمبوند اتحفظ، بس ${added ? `اتضاف ${added} وحدة بس — ` : "الوحدات ما اتضافتش — "}${error.code === "23505" ? "فيه كود وحدة متكرر" : error.message}. كمّل من لوحة الكمبوند ← الوحدات.`);
        break;
      }
      added += chunk.length;
    }
    setBusy(false);
    const what = initial?.review_status === "rejected" ? "اتبعت للمراجعة" : initial ? "تم حفظ الكمبوند" : "تم نشر الكمبوند";
    toast.success(added ? `${what} واتضافت ${added} وحدة` : what);
    onDone(id);
  }

  const handover = admin && initial && !initial.developer_id && f.developer_id;
  return (
    <div className="rounded-2xl border bg-card p-4 md:p-6">
      <h3 className="mb-4 text-lg font-extrabold text-primary">{initial ? "تعديل بيانات الكمبوند" : "إضافة كمبوند جديد"}</h3>
      {initial?.review_status === "rejected" && <p className="mb-4 rounded-xl bg-teal-soft p-3 text-xs font-semibold text-primary">الكمبوند ده مخفي من الإدارة؛ بعد التعديل هيرجع للمراجعة قبل ما يظهر.</p>}
      {initial?.review_note && <p className="mb-4 rounded-xl bg-destructive/10 p-3 text-xs font-semibold text-destructive">ملاحظة الإدارة: {initial.review_note}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><Field label="اسم الكمبوند"><input className={inputCls} value={f.name} onChange={set("name")} maxLength={120} /></Field></div>
        {admin && (
          <>
            <Field label="صاحب الكمبوند">
              <select className={inputCls} value={f.developer_id} onChange={set("developer_id")}>
                <option value="">فاليو عقار بتديره (المطور لسه مش مشترك)</option>
                {developers!.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </Field>
            {!f.developer_id ? (
              <Field label="اسم المطور (بيظهر للعملاء)"><input className={inputCls} value={f.developer_name} onChange={set("developer_name")} maxLength={150} placeholder="مثال: شركة النخبة للتطوير" /></Field>
            ) : <div />}
            {handover && <p className="rounded-xl bg-teal-soft p-3 text-xs font-semibold text-primary sm:col-span-2">هيتنقل الكمبوند بكل وحداته وطلباته لحساب المطور، والمطور هيوصله إشعار. فريق فاليو عقار اللي على الكمبوند هيتشال منه.</p>}
          </>
        )}
        <PlacePicker city={f.city} area={f.area} onChange={(v) => setF({ ...f, ...v })} />
        <div className="sm:col-span-2"><Field label="العنوان التفصيلي (اختياري)"><input className={inputCls} value={f.location} onChange={set("location")} maxLength={300} /></Field></div>
        <Field label="ميعاد الاستلام (بيظهر زي ما هو)"><input className={inputCls} placeholder="مثال: 2028 أو فوري" value={f.delivery_date} onChange={set("delivery_date")} maxLength={100} /></Field>
        <Field label="سنة الاستلام (للفلتر)"><input className={inputCls} inputMode="numeric" placeholder="مثال: 2028" value={f.delivery_year} onChange={digits("delivery_year")} maxLength={4} /></Field>
        <Field label="قسمة الوسطاء (%) — اختياري"><input className={inputCls} inputMode="numeric" placeholder="فاضية = مقفول للوسطاء" value={f.co_broke_share} onChange={(e) => setF({ ...f, co_broke_share: e.target.value.replace(ARABIC_DIGITS, latinDigit).replace(/[^d.]/g, "").slice(0, 4) })} /></Field>
        <Field label="أقل مقدم (%)"><input className={inputCls} inputMode="numeric" placeholder="مثال: 10" value={f.down_payment_pct} onChange={digits("down_payment_pct")} maxLength={3} /></Field>
        <Field label="أطول تقسيط (سنين)"><input className={inputCls} inputMode="numeric" placeholder="مثال: 7" value={f.installment_years} onChange={digits("installment_years")} maxLength={2} /></Field>
        <div className="sm:col-span-2"><Field label="أنظمة التقسيط بالتفصيل"><textarea className={`${inputCls} h-24 py-2`} placeholder="مثال: مقدم 10% وتقسيط على 7 سنين، أو كاش بخصم 15%" value={f.payment_plans} onChange={set("payment_plans")} maxLength={2000} /></Field></div>
        <div className="sm:col-span-2"><Field label="وصف الكمبوند"><textarea className={`${inputCls} h-32 py-2`} value={f.description} onChange={set("description")} maxLength={2000} /></Field></div>
        <div className="sm:col-span-2">
          <p className="mb-2 text-sm font-bold text-primary">الخدمات</p>
          <div className="flex flex-wrap gap-2">
            {AMENITIES.map((a) => { const on = f.amenities.includes(a); return (
              <button key={a} type="button" onClick={() => setF({ ...f, amenities: on ? f.amenities.filter((x) => x !== a) : [...f.amenities, a] })} className={`h-10 rounded-full border px-4 text-sm font-bold transition ${on ? "border-primary bg-primary text-primary-foreground" : "bg-card text-primary hover:border-teal"}`}>{a}</button>
            ); })}
          </div>
        </div>
        <div className="sm:col-span-2">
          <Field label={`صور الكمبوند (${f.images.length}/${MAX_IMAGES}) — أول صورة هي الرئيسية`}>
            <input type="file" accept="image/*" multiple disabled={busy || f.images.length >= MAX_IMAGES} onChange={onFiles} className="block w-full text-sm file:me-3 file:rounded-lg file:border-0 file:bg-secondary file:px-4 file:py-2 file:font-bold file:text-primary" />
          </Field>
          {f.images.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {f.images.map((url, i) => (
                <div key={url} className="relative">
                  <img src={url} alt="" className="h-24 w-32 rounded-xl object-cover" />
                  <div className="absolute inset-x-1 bottom-1 flex justify-between">
                    {i > 0 ? <button type="button" onClick={() => setF((x) => ({ ...x, images: [url, ...x.images.filter((u) => u !== url)] }))} className="rounded-full bg-background/90 px-2 py-0.5 text-[10px] font-bold text-primary">اجعلها الرئيسية</button> : <span className="rounded-full bg-primary/85 px-2 py-0.5 text-[10px] font-bold text-primary-foreground">الرئيسية</span>}
                    <button type="button" aria-label="حذف الصورة" onClick={() => setF((x) => ({ ...x, images: x.images.filter((u) => u !== url) }))} className="rounded-full bg-background/90 px-2 py-0.5 text-[10px] font-bold text-destructive">حذف</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="sm:col-span-2"><Field label="موقع الكمبوند على الخريطة"><MapPicker value={loc} onChange={setLoc} /></Field></div>
        <div className="space-y-2 sm:col-span-2">
          <p className="text-sm font-bold text-primary">وحدات الكمبوند من Excel</p>
          {!showUnits
            ? <button type="button" onClick={() => setShowUnits(true)} className={btnOutline}><FileSpreadsheet className="size-4" />{initial ? "ضيف وحدات من Excel" : "ارفع وحدات الكمبوند من Excel"}</button>
            : <UnitsImport existingCodes={codes} onReady={setUnits} />}
          <p className="text-xs text-muted-foreground">اختياري — تقدر تضيف الوحدات بعدين من لوحة الكمبوند ← الوحدات.</p>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <button disabled={busy} onClick={save} className={btnPrimary}>{busy ? "..." : `${initial ? "حفظ" : "نشر الكمبوند"}${units?.length ? ` + ${units.length} وحدة` : ""}`}</button>
        <button onClick={onCancel} className="h-11 px-4 text-sm font-bold text-muted-foreground hover:text-primary">إلغاء</button>
      </div>
    </div>
  );
}
