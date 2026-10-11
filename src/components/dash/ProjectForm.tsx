import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { CITY_NAMES, DEFAULT_CITY, areasOf, uploadImage } from "@/components/site/data";
import { AMENITIES, type ProjectRow } from "@/components/site/projects";
import { Field, inputCls, btnPrimary } from "@/components/site/ui";
import { MapPicker, type LatLng } from "@/components/site/MapPicker";

type Props = { developerId: string; initial?: ProjectRow | null; onDone: () => void; onCancel: () => void };

const MAX_IMAGES = 12;

export function ProjectForm({ developerId, initial, onDone, onCancel }: Props) {
  const [f, setF] = useState({
    name: initial?.name ?? "",
    description: initial?.description ?? "",
    city: initial?.city ?? DEFAULT_CITY,
    area: initial?.area ?? areasOf(DEFAULT_CITY)[0]!,
    address: initial?.address ?? "",
    payment_plans: initial?.payment_plans ?? "",
    delivery_date: initial?.delivery_date ?? "",
    amenities: initial?.amenities ?? ([] as string[]),
    images: initial?.images ?? ([] as string[]),
  });
  const [loc, setLoc] = useState<LatLng | null>(initial?.lat != null && initial?.lng != null ? { lat: initial.lat, lng: initial.lng } : null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

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
    if (f.name.trim().length < 2) { toast.error("اكتب اسم المشروع"); return; }
    setBusy(true);
    const payload = {
      name: f.name.trim().slice(0, 150), description: f.description.trim().slice(0, 5000) || null,
      city: f.city, area: areasOf(f.city).includes(f.area) ? f.area : areasOf(f.city)[0]!,
      address: f.address.trim().slice(0, 300) || null, payment_plans: f.payment_plans.trim().slice(0, 2000) || null,
      delivery_date: f.delivery_date.trim().slice(0, 100) || null, amenities: f.amenities, images: f.images,
      lat: loc?.lat ?? null, lng: loc?.lng ?? null,
    };
    const res = initial
      ? await supabase.from("projects").update(payload).eq("id", initial.id)
      : await supabase.from("projects").insert({ ...payload, developer_id: developerId });
    setBusy(false);
    if (res.error) { toast.error(res.error.message); return; }
    toast.success(initial?.review_status === "rejected" ? "تم إرسال المشروع للمراجعة" : initial ? "تم حفظ المشروع" : "تم نشر المشروع");
    onDone();
  }

  return (
    <div className="rounded-2xl border bg-card p-4 md:p-6">
      <h3 className="mb-4 text-lg font-extrabold text-primary">{initial ? "تعديل المشروع" : "إضافة مشروع جديد"}</h3>
      {initial?.review_status === "rejected" && <p className="mb-4 rounded-xl bg-teal-soft p-3 text-xs font-semibold text-primary">المشروع ده مخفي من الإدارة؛ بعد التعديل هيرجع للمراجعة قبل ما يظهر.</p>}
      {initial?.review_note && <p className="mb-4 rounded-xl bg-destructive/10 p-3 text-xs font-semibold text-destructive">ملاحظة الإدارة: {initial.review_note}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><Field label="اسم المشروع / الكمبوند"><input className={inputCls} value={f.name} onChange={set("name")} maxLength={150} /></Field></div>
        <Field label="المدينة"><select className={inputCls} value={f.city} onChange={(e) => setF({ ...f, city: e.target.value, area: areasOf(e.target.value)[0]! })}>{CITY_NAMES.map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="المنطقة / الحي"><select className={inputCls} value={f.area} onChange={set("area")}>{areasOf(f.city).map((a) => <option key={a}>{a}</option>)}</select></Field>
        <Field label="العنوان التفصيلي (اختياري)"><input className={inputCls} value={f.address} onChange={set("address")} maxLength={300} /></Field>
        <Field label="ميعاد التسليم"><input className={inputCls} placeholder="مثال: 2028 أو فوري" value={f.delivery_date} onChange={set("delivery_date")} maxLength={100} /></Field>
        <div className="sm:col-span-2"><Field label="وصف المشروع"><textarea className={`${inputCls} h-28 py-2`} value={f.description} onChange={set("description")} maxLength={5000} /></Field></div>
        <div className="sm:col-span-2"><Field label="أنظمة التقسيط"><textarea className={`${inputCls} h-24 py-2`} placeholder="مثال: مقدم 10% وتقسيط على 7 سنين" value={f.payment_plans} onChange={set("payment_plans")} maxLength={2000} /></Field></div>
        <div className="sm:col-span-2">
          <p className="mb-2 text-sm font-bold text-primary">الخدمات</p>
          <div className="flex flex-wrap gap-2">
            {AMENITIES.map((a) => { const on = f.amenities.includes(a); return (
              <button key={a} type="button" onClick={() => setF({ ...f, amenities: on ? f.amenities.filter((x) => x !== a) : [...f.amenities, a] })} className={`h-10 rounded-full border px-4 text-sm font-bold transition ${on ? "border-primary bg-primary text-primary-foreground" : "bg-card text-primary hover:border-teal"}`}>{a}</button>
            ); })}
          </div>
        </div>
        <div className="sm:col-span-2">
          <Field label={`صور المشروع (${f.images.length}/${MAX_IMAGES}) — أول صورة هي الرئيسية`}>
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
        <div className="sm:col-span-2"><Field label="موقع المشروع على الخريطة"><MapPicker value={loc} onChange={setLoc} /></Field></div>
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <button disabled={busy} onClick={save} className={btnPrimary}>{initial ? "حفظ" : "نشر المشروع"}</button>
        <button onClick={onCancel} className="h-11 px-4 text-sm font-bold text-muted-foreground hover:text-primary">إلغاء</button>
      </div>
    </div>
  );
}
