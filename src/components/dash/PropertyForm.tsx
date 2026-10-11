import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AREAS, CITY_NAMES, DEFAULT_CITY, areasOf, TYPES_FOR, FURNISHED_LABEL, uploadImage, type PropertyRow } from "@/components/site/data";
import { Field, inputCls, btnPrimary, btnOutline } from "@/components/site/ui";
import { MapPicker, type LatLng } from "@/components/site/MapPicker";

type Props = { brokerId: string; initial?: PropertyRow | null; onDone: () => void; onCancel: () => void };

const MAX_IMAGES = 12;

export function PropertyForm({ brokerId, initial, onDone, onCancel }: Props) {
  const [f, setF] = useState({
    title: initial?.title ?? "",
    description: initial?.description ?? "",
    price: initial ? String(initial.price) : "",
    type: initial?.type ?? TYPES_FOR[""]![0]!,
    city: initial?.city ?? DEFAULT_CITY,
    area: initial?.area ?? AREAS[0]!,
    size: initial ? String(initial.size) : "",
    rooms: initial?.rooms != null ? String(initial.rooms) : "",
    baths: initial?.baths != null ? String(initial.baths) : "",
    status: initial?.status ?? "بيع",
    images: initial?.images?.length ? initial.images : initial?.image_url ? [initial.image_url] : ([] as string[]),
    source_url: initial?.source_url ?? "",
    price_night: initial?.price_night?.toString() ?? "", price_week: initial?.price_week?.toString() ?? "",
    price_month: initial?.price_month?.toString() ?? "", price_season: initial?.price_season?.toString() ?? "",
    furnished: initial?.furnished ?? "", min_months: initial?.min_months?.toString() ?? "", deposit: initial?.deposit?.toString() ?? "",
    guests: initial?.guests?.toString() ?? "", available_from: initial?.available_from ?? "", available_to: initial?.available_to ?? "",
  });
  const summer = f.status === "مصيف";
  const rent = f.status !== "بيع";
  const [loc, setLoc] = useState<LatLng | null>(initial?.lat != null && initial?.lng != null ? { lat: initial.lat, lng: initial.lng } : null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
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

  async function save(submit: boolean) {
    const anySummerPrice = !!(f.price_night || f.price_week || f.price_month || f.price_season);
    if (f.title.trim().length < 3 || (summer ? !anySummerPrice : !f.price)) { toast.error(summer ? "أدخل العنوان وسعر واحد على الأقل (الليلة أو الأسبوع أو الشهر أو الموسم)" : "أدخل العنوان والسعر"); return; }
    const src = f.source_url.trim();
    if (src && !/^https:\/\/[a-z0-9-]+\.engazcrm\.net\//i.test(src)) { toast.error("رابط إنجاز غير صحيح — يجب أن يبدأ بـ https://…engazcrm.net/"); return; }
    setBusy(true);
    const payload = {
      title: f.title.trim().slice(0, 150), description: f.description.trim().slice(0, 3000) || null,
      price: summer ? 0 : Number(f.price), type: f.type,
      price_night: summer ? num(f.price_night) : null, price_week: summer ? num(f.price_week) : null,
      price_month: summer ? num(f.price_month) : null, price_season: summer ? num(f.price_season) : null,
      furnished: rent ? f.furnished || null : null, min_months: f.status === "إيجار" ? num(f.min_months) : null,
      deposit: rent ? num(f.deposit) : null, guests: summer ? num(f.guests) : null,
      available_from: rent ? f.available_from || null : null, available_to: summer ? f.available_to || null : null, city: f.city, area: areasOf(f.city).includes(f.area) ? f.area : areasOf(f.city)[0]!, size: Number(f.size || 0),
      rooms: num(f.rooms), baths: num(f.baths), status: f.status, image_url: f.images[0] ?? null, images: f.images, source_url: src || null,
      lat: loc?.lat ?? null, lng: loc?.lng ?? null,
      review_status: (submit ? "pending" : "draft") as "pending" | "draft",
    };
    const res = initial
      ? await supabase.from("properties").update(payload).eq("id", initial.id)
      : await supabase.from("properties").insert({ ...payload, broker_id: brokerId });
    setBusy(false);
    if (res.error) { toast.error(res.error.message); return; }
    toast.success(!submit ? "تم الحفظ كمسودة" : initial?.review_status === "rejected" ? "تم إرسال العقار للمراجعة" : "تم نشر العقار");
    onDone();
  }

  return (
    <div className="rounded-2xl border bg-card p-4 md:p-6">
      <h3 className="mb-4 text-lg font-extrabold text-primary">{initial ? "تعديل العقار" : "إضافة عقار جديد"}</h3>
      {initial?.review_status === "rejected" && <p className="mb-4 rounded-xl bg-teal-soft p-3 text-xs font-semibold text-primary">العقار ده اترفض من الإدارة؛ بعد التعديل هيرجع للمراجعة قبل ما يظهر.</p>}
      {initial?.review_note && <p className="mb-4 rounded-xl bg-destructive/10 p-3 text-xs font-semibold text-destructive">ملاحظة الإدارة: {initial.review_note}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><Field label="عنوان الإعلان"><input className={inputCls} value={f.title} onChange={set("title")} maxLength={150} /></Field></div>
        <Field label="الغرض"><select className={inputCls} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value, type: TYPES_FOR[e.target.value]!.includes(f.type) ? f.type : TYPES_FOR[e.target.value]![0]! })}><option value="بيع">بيع</option><option value="إيجار">إيجار شهري</option><option value="مصيف">مصيف (يومي / أسبوعي / موسم)</option></select></Field>
        {!summer && <Field label={f.status === "إيجار" ? "الإيجار الشهري (ج.م)" : "السعر (ج.م)"}><input className={inputCls} inputMode="numeric" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value.replace(/\D/g, "") })} /></Field>}
        <Field label="النوع"><select className={inputCls} value={f.type} onChange={set("type")}>{TYPES_FOR[f.status]!.map((t) => <option key={t}>{t}</option>)}</select></Field>
        {summer && (
          <div className="grid grid-cols-2 gap-3 sm:col-span-2 sm:grid-cols-4">
            <Field label="سعر الليلة"><input className={inputCls} inputMode="numeric" value={f.price_night} onChange={(e) => setF({ ...f, price_night: e.target.value.replace(/\D/g, "") })} /></Field>
            <Field label="سعر الأسبوع"><input className={inputCls} inputMode="numeric" value={f.price_week} onChange={(e) => setF({ ...f, price_week: e.target.value.replace(/\D/g, "") })} /></Field>
            <Field label="سعر الشهر"><input className={inputCls} inputMode="numeric" value={f.price_month} onChange={(e) => setF({ ...f, price_month: e.target.value.replace(/\D/g, "") })} /></Field>
            <Field label="سعر الموسم كله"><input className={inputCls} inputMode="numeric" value={f.price_season} onChange={(e) => setF({ ...f, price_season: e.target.value.replace(/\D/g, "") })} /></Field>
          </div>
        )}
        {rent && (
          <div className="grid grid-cols-2 gap-3 sm:col-span-2 sm:grid-cols-4">
            <Field label="الفرش"><select className={inputCls} value={f.furnished} onChange={set("furnished")}><option value="">—</option>{Object.entries(FURNISHED_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
            {summer
              ? <Field label="عدد الأفراد"><input className={inputCls} inputMode="numeric" value={f.guests} onChange={(e) => setF({ ...f, guests: e.target.value.replace(/\D/g, "") })} /></Field>
              : <Field label="أقل مدة (شهور)"><input className={inputCls} inputMode="numeric" value={f.min_months} onChange={(e) => setF({ ...f, min_months: e.target.value.replace(/\D/g, "") })} /></Field>}
            <Field label="التأمين (ج.م)"><input className={inputCls} inputMode="numeric" value={f.deposit} onChange={(e) => setF({ ...f, deposit: e.target.value.replace(/\D/g, "") })} /></Field>
            <Field label="متاح من"><input type="date" className={inputCls} value={f.available_from} onChange={set("available_from")} /></Field>
            {summer && <Field label="متاح لحد"><input type="date" className={inputCls} value={f.available_to} onChange={set("available_to")} /></Field>}
          </div>
        )}
        <Field label="المدينة"><select className={inputCls} value={f.city} onChange={(e) => setF({ ...f, city: e.target.value, area: areasOf(e.target.value)[0]! })}>{CITY_NAMES.map((t) => <option key={t}>{t}</option>)}</select></Field>
        <Field label="المنطقة / الحي"><select className={inputCls} value={f.area} onChange={set("area")}>{areasOf(f.city).map((t) => <option key={t}>{t}</option>)}</select></Field>
        <Field label="المساحة (م²)"><input className={inputCls} inputMode="numeric" value={f.size} onChange={(e) => setF({ ...f, size: e.target.value.replace(/\D/g, "") })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="الغرف"><input className={inputCls} inputMode="numeric" value={f.rooms} onChange={(e) => setF({ ...f, rooms: e.target.value.replace(/\D/g, "") })} /></Field>
          <Field label="الحمامات"><input className={inputCls} inputMode="numeric" value={f.baths} onChange={(e) => setF({ ...f, baths: e.target.value.replace(/\D/g, "") })} /></Field>
        </div>
        <div className="sm:col-span-2"><Field label="رابط العقار في إنجاز (اختياري)"><input className={inputCls} dir="ltr" inputMode="url" placeholder="https://valuegroup.engazcrm.net/consumer/unit/..." value={f.source_url} onChange={set("source_url")} maxLength={500} /></Field></div>
        <div className="sm:col-span-2"><Field label="الوصف"><textarea className={`${inputCls} h-28 py-2`} value={f.description} onChange={set("description")} maxLength={3000} /></Field></div>
        <div className="sm:col-span-2">
          <Field label={`صور العقار (${f.images.length}/${MAX_IMAGES}) — أول صورة هي الرئيسية`}>
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
        <div className="sm:col-span-2">
          <Field label="موقع العقار على الخريطة (اختياري)">
            <MapPicker value={loc} onChange={setLoc} />
          </Field>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <button disabled={busy} onClick={() => save(true)} className={btnPrimary}>{initial?.review_status === "rejected" ? "إرسال للمراجعة" : "نشر العقار"}</button>
        <button disabled={busy} onClick={() => save(false)} className={btnOutline}>حفظ كمسودة</button>
        <button onClick={onCancel} className="h-11 px-4 text-sm font-bold text-muted-foreground hover:text-primary">إلغاء</button>
      </div>
    </div>
  );
}
