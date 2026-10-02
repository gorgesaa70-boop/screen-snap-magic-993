import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AREAS, TYPES, uploadImage, type PropertyRow } from "@/components/site/data";
import { Field, inputCls, btnPrimary, btnOutline } from "@/components/site/ui";

type Props = { brokerId: string; initial?: PropertyRow | null; onDone: () => void; onCancel: () => void };

export function PropertyForm({ brokerId, initial, onDone, onCancel }: Props) {
  const [f, setF] = useState({
    title: initial?.title ?? "",
    description: initial?.description ?? "",
    price: initial ? String(initial.price) : "",
    type: initial?.type ?? TYPES[0],
    area: initial?.area ?? AREAS[0],
    size: initial ? String(initial.size) : "",
    rooms: initial?.rooms != null ? String(initial.rooms) : "",
    baths: initial?.baths != null ? String(initial.baths) : "",
    status: initial?.status ?? "بيع",
    image_url: initial?.image_url ?? "",
  });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const num = (v: string) => (v === "" ? null : Number(v));

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try { setBusy(true); const url = await uploadImage(file); setF((x) => ({ ...x, image_url: url })); }
    catch (err) { toast.error((err as Error).message); }
    finally { setBusy(false); }
  }

  async function save(submit: boolean) {
    if (f.title.trim().length < 3 || !f.price) { toast.error("أدخل العنوان والسعر"); return; }
    setBusy(true);
    const payload = {
      title: f.title.trim().slice(0, 150), description: f.description.trim().slice(0, 3000) || null,
      price: Number(f.price), type: f.type, area: f.area, size: Number(f.size || 0),
      rooms: num(f.rooms), baths: num(f.baths), status: f.status, image_url: f.image_url || null,
      review_status: (submit ? "pending" : "draft") as "pending" | "draft",
    };
    const res = initial
      ? await supabase.from("properties").update(payload).eq("id", initial.id)
      : await supabase.from("properties").insert({ ...payload, broker_id: brokerId });
    setBusy(false);
    if (res.error) { toast.error(res.error.message); return; }
    toast.success(submit ? "تم إرسال العقار للمراجعة" : "تم الحفظ كمسودة");
    onDone();
  }

  return (
    <div className="rounded-2xl border bg-card p-4 md:p-6">
      <h3 className="mb-4 text-lg font-extrabold text-primary">{initial ? "تعديل العقار" : "إضافة عقار جديد"}</h3>
      {initial?.review_status === "approved" && <p className="mb-4 rounded-xl bg-teal-soft p-3 text-xs font-semibold text-primary">تعديل عقار معتمد يعيده للمراجعة من جديد.</p>}
      {initial?.review_note && <p className="mb-4 rounded-xl bg-destructive/10 p-3 text-xs font-semibold text-destructive">ملاحظة الإدارة: {initial.review_note}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><Field label="عنوان الإعلان"><input className={inputCls} value={f.title} onChange={set("title")} maxLength={150} /></Field></div>
        <Field label="الغرض"><select className={inputCls} value={f.status} onChange={set("status")}><option>بيع</option><option>إيجار</option></select></Field>
        <Field label="السعر (ج.م)"><input className={inputCls} inputMode="numeric" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value.replace(/\D/g, "") })} /></Field>
        <Field label="النوع"><select className={inputCls} value={f.type} onChange={set("type")}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select></Field>
        <Field label="المنطقة"><select className={inputCls} value={f.area} onChange={set("area")}>{AREAS.map((t) => <option key={t}>{t}</option>)}</select></Field>
        <Field label="المساحة (م²)"><input className={inputCls} inputMode="numeric" value={f.size} onChange={(e) => setF({ ...f, size: e.target.value.replace(/\D/g, "") })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="الغرف"><input className={inputCls} inputMode="numeric" value={f.rooms} onChange={(e) => setF({ ...f, rooms: e.target.value.replace(/\D/g, "") })} /></Field>
          <Field label="الحمامات"><input className={inputCls} inputMode="numeric" value={f.baths} onChange={(e) => setF({ ...f, baths: e.target.value.replace(/\D/g, "") })} /></Field>
        </div>
        <div className="sm:col-span-2"><Field label="الوصف"><textarea className={`${inputCls} h-28 py-2`} value={f.description} onChange={set("description")} maxLength={3000} /></Field></div>
        <div className="sm:col-span-2">
          <Field label="صورة العقار"><input type="file" accept="image/*" onChange={onFile} className="block w-full text-sm file:me-3 file:rounded-lg file:border-0 file:bg-secondary file:px-4 file:py-2 file:font-bold file:text-primary" /></Field>
          {f.image_url && <img src={f.image_url} alt="" className="mt-3 h-32 rounded-xl object-cover" />}
        </div>
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <button disabled={busy} onClick={() => save(true)} className={btnPrimary}>إرسال للمراجعة</button>
        <button disabled={busy} onClick={() => save(false)} className={btnOutline}>حفظ كمسودة</button>
        <button onClick={onCancel} className="h-11 px-4 text-sm font-bold text-muted-foreground hover:text-primary">إلغاء</button>
      </div>
    </div>
  );
}
