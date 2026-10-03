import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { uploadImage, type PropertyRow } from "@/components/site/data";
import { IND_TYPES, indType, fetchZones, fetchActivities, uploadVideo } from "@/components/site/industrial";
import { Field, inputCls, btnPrimary, btnOutline } from "@/components/site/ui";
import { MapPicker, type LatLng } from "@/components/site/MapPicker";

type Props = {
  brokerId?: string | undefined;
  brokers?: { id: string; name: string }[] | undefined; // admin picks the responsible broker
  initial?: PropertyRow | null;
  onDone: () => void;
  onCancel: () => void;
};

const digits = (v: string) => v.replace(/[^\d.]/g, "");

export function IndustrialForm({ brokerId, brokers, initial, onDone, onCancel }: Props) {
  const zones = useQuery({ queryKey: ["ind-zones"], queryFn: () => fetchZones() });
  const acts = useQuery({ queryKey: ["ind-acts"], queryFn: () => fetchActivities() });
  const [f, setF] = useState({
    title: initial?.title ?? "",
    type: initial?.type ?? IND_TYPES[0].value,
    zone_id: initial?.zone_id ?? "",
    activity_id: initial?.activity_id ?? "",
    address: initial?.address ?? "",
    land_size: initial?.land_size != null ? String(initial.land_size) : "",
    built_size: initial?.built_size != null ? String(initial.built_size) : "",
    price: initial ? String(initial.price) : "",
    status: initial?.status ?? "بيع",
    description: initial?.description ?? "",
    image_url: initial?.image_url ?? "",
    broker_id: initial?.broker_id ?? brokerId ?? "",
  });
  const [videos, setVideos] = useState<string[]>(initial?.video_urls ?? []);
  const [loc, setLoc] = useState<LatLng | null>(initial?.lat != null && initial?.lng != null ? { lat: initial.lat, lng: initial.lng } : null);
  const [busy, setBusy] = useState(false);
  const [actQ, setActQ] = useState("");
  const t = indType(f.type);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  async function onImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    try { setBusy(true); const url = await uploadImage(file); setF((x) => ({ ...x, image_url: url })); }
    catch (err) { toast.error((err as Error).message); } finally { setBusy(false); }
  }
  async function onVideo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; e.target.value = ""; if (!file) return;
    if (videos.length >= 3) { toast.error("الحد الأقصى 3 فيديوهات"); return; }
    try { setBusy(true); toast.info("جارٍ رفع الفيديو..."); const url = await uploadVideo(file); setVideos((v) => [...v, url]); toast.success("تم رفع الفيديو"); }
    catch (err) { toast.error((err as Error).message); } finally { setBusy(false); }
  }

  async function save(submit: boolean) {
    const zone = zones.data?.find((z) => z.id === f.zone_id);
    if (f.title.trim().length < 3 || !f.price || !zone) { toast.error("أدخل اسم العقار والسعر والمنطقة الصناعية"); return; }
    const land = t.land && f.land_size ? Number(f.land_size) : null;
    const built = t.built && f.built_size ? Number(f.built_size) : null;
    if ((t.land && !land) || (!t.land && !built)) { toast.error(t.land ? "أدخل مساحة الأرض" : "أدخل المساحة المبنية"); return; }
    if (brokers && !f.broker_id) { toast.error("اختر الوسيط المسؤول"); return; }
    setBusy(true);
    const payload = {
      category: "industrial", title: f.title.trim().slice(0, 150), type: f.type,
      zone_id: zone.id, area: zone.name, activity_id: f.activity_id || null,
      address: f.address.trim().slice(0, 300) || null,
      land_size: land, built_size: built, size: (t.land ? land : built) ?? 0,
      price: Number(f.price), status: f.status, description: f.description.trim().slice(0, 3000) || null,
      image_url: f.image_url || null, video_urls: videos, rooms: null, baths: null,
      lat: loc?.lat ?? null, lng: loc?.lng ?? null,
      review_status: (brokers ? (submit ? "approved" : "draft") : submit ? "pending" : "draft") as "pending" | "draft" | "approved",
    };
    const bid = f.broker_id || null;
    const res = initial
      ? await supabase.from("properties").update(brokers ? { ...payload, broker_id: bid } : payload).eq("id", initial.id)
      : await supabase.from("properties").insert({ ...payload, broker_id: bid });
    setBusy(false);
    if (res.error) { toast.error(res.error.message); return; }
    toast.success(brokers ? (submit ? "تم النشر" : "تم الحفظ كمسودة") : submit ? "تم إرسال العقار للمراجعة" : "تم الحفظ كمسودة");
    onDone();
  }

  const actList = (acts.data ?? []).filter((a) => !actQ || a.name.includes(actQ) || a.id === f.activity_id);
  const num = (k: "land_size" | "built_size" | "price") => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: digits(e.target.value) });

  return (
    <div className="rounded-2xl border bg-card p-4 md:p-6">
      <h3 className="mb-4 text-lg font-extrabold text-primary">{initial ? "تعديل عقار صناعي" : "إضافة عقار صناعي"}</h3>
      {!brokers && initial?.review_status === "approved" && <p className="mb-4 rounded-xl bg-teal-soft p-3 text-xs font-semibold text-primary">تعديل عقار معتمد يعيده للمراجعة من جديد.</p>}
      {initial?.review_note && <p className="mb-4 rounded-xl bg-destructive/10 p-3 text-xs font-semibold text-destructive">ملاحظة الإدارة: {initial.review_note}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><Field label="اسم العقار"><input className={inputCls} value={f.title} onChange={set("title")} maxLength={150} /></Field></div>
        <Field label="نوع العقار"><select className={inputCls} value={f.type} onChange={set("type")}>{IND_TYPES.map((x) => <option key={x.value}>{x.value}</option>)}</select></Field>
        <Field label="الحالة"><select className={inputCls} value={f.status} onChange={set("status")}><option value="بيع">للبيع</option><option value="إيجار">للإيجار</option></select></Field>
        <Field label="المنطقة الصناعية"><select className={inputCls} value={f.zone_id} onChange={set("zone_id")}><option value="">اختر المنطقة</option>{zones.data?.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}</select></Field>
        <Field label="نوع النشاط">
          <div className="space-y-1.5">
            <input className={inputCls} placeholder="ابحث في الأنشطة..." value={actQ} onChange={(e) => setActQ(e.target.value)} />
            <select className={inputCls} value={f.activity_id} onChange={set("activity_id")}><option value="">بدون تحديد</option>{actList.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
          </div>
        </Field>
        <div className="sm:col-span-2"><Field label="الموقع التفصيلي"><input className={inputCls} value={f.address} onChange={set("address")} maxLength={300} placeholder="مثال: بلوك 5، قطعة 12" /></Field></div>
        {t.land && <Field label="مساحة الأرض (م²)"><input className={inputCls} inputMode="decimal" value={f.land_size} onChange={num("land_size")} /></Field>}
        {t.built && <Field label="مساحة المباني (م²)"><input className={inputCls} inputMode="decimal" value={f.built_size} onChange={num("built_size")} /></Field>}
        <Field label="السعر (ج.م)"><input className={inputCls} inputMode="numeric" value={f.price} onChange={num("price")} /></Field>
        {brokers && (
          <Field label="الوسيط المسؤول"><select className={inputCls} value={f.broker_id} onChange={set("broker_id")}><option value="">اختر الوسيط</option>{brokers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
        )}
        <div className="sm:col-span-2"><Field label="وصف العقار"><textarea className={`${inputCls} h-28 py-2`} value={f.description} onChange={set("description")} maxLength={3000} /></Field></div>
        <div className="sm:col-span-2">
          <Field label="الصورة الرئيسية"><input type="file" accept="image/*" onChange={onImage} className="block w-full text-sm file:me-3 file:rounded-lg file:border-0 file:bg-secondary file:px-4 file:py-2 file:font-bold file:text-primary" /></Field>
          {f.image_url && <img src={f.image_url} alt="" className="mt-3 h-32 rounded-xl object-cover" />}
        </div>
        <div className="sm:col-span-2">
          <Field label="فيديوهات (حتى 3، بحد 50 ميجا لكل فيديو)"><input type="file" accept="video/*" onChange={onVideo} disabled={busy} className="block w-full text-sm file:me-3 file:rounded-lg file:border-0 file:bg-secondary file:px-4 file:py-2 file:font-bold file:text-primary" /></Field>
          {videos.length > 0 && (
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {videos.map((v) => (
                <div key={v} className="relative">
                  <video src={v} controls preload="metadata" className="aspect-video w-full rounded-xl bg-muted" />
                  <button type="button" aria-label="حذف الفيديو" onClick={() => setVideos((x) => x.filter((y) => y !== v))} className="absolute top-1 left-1 grid size-8 place-items-center rounded-full bg-background/90 text-destructive"><X className="size-4" /></button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="sm:col-span-2"><Field label="موقع العقار على الخريطة"><MapPicker value={loc} onChange={setLoc} /></Field></div>
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <button disabled={busy} onClick={() => save(true)} className={btnPrimary}>{brokers ? "حفظ ونشر" : "إرسال للمراجعة"}</button>
        <button disabled={busy} onClick={() => save(false)} className={btnOutline}>حفظ كمسودة</button>
        <button onClick={onCancel} className="h-11 px-4 text-sm font-bold text-muted-foreground hover:text-primary">إلغاء</button>
      </div>
    </div>
  );
}
