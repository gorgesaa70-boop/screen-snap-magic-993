import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { uploadImage, type PropertyRow } from "@/components/site/data";
import { MALL_UNIT_TYPES, fetchMalls } from "@/components/site/malls";
import { Field, inputCls, btnPrimary, btnOutline } from "@/components/site/ui";

type Props = { brokerId?: string | undefined; brokers?: { id: string; name: string }[] | undefined; initial?: PropertyRow | null; onDone: () => void; onCancel: () => void };

export function MallUnitForm({ brokerId, brokers, initial, onDone, onCancel }: Props) {
  const malls = useQuery({ queryKey: ["malls"], queryFn: () => fetchMalls() });
  const [f, setF] = useState({
    title: initial?.title ?? "", mall_id: initial?.mall_id ?? "", type: initial?.type ?? MALL_UNIT_TYPES[0]!,
    floor: initial?.floor ?? "", size: initial ? String(initial.size) : "", price: initial ? String(initial.price) : "",
    status: initial?.status ?? "بيع", description: initial?.description ?? "", image_url: initial?.image_url ?? "",
    broker_id: initial?.broker_id ?? brokerId ?? "",
  });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const num = (k: "size" | "price") => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value.replace(/[^\d.]/g, "") });

  async function onImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    try { setBusy(true); const url = await uploadImage(file); setF((x) => ({ ...x, image_url: url })); }
    catch (err) { toast.error((err as Error).message); } finally { setBusy(false); }
  }

  async function save(submit: boolean) {
    const mall = malls.data?.find((m) => m.id === f.mall_id);
    if (f.title.trim().length < 3 || !f.price || !f.size || !mall) { toast.error("أدخل اسم الوحدة والمول والمساحة والسعر"); return; }
    if (brokers && !f.broker_id) { toast.error("اختر الوسيط المسؤول"); return; }
    setBusy(true);
    const payload = {
      category: "mall", title: f.title.trim().slice(0, 150), mall_id: mall.id, area: mall.name, type: f.type,
      floor: f.floor.trim().slice(0, 50) || null, size: Number(f.size), price: Number(f.price), status: f.status,
      description: f.description.trim().slice(0, 3000) || null, image_url: f.image_url || null, rooms: null, baths: null,
      review_status: (brokers ? (submit ? "approved" : "draft") : submit ? "pending" : "draft") as "pending" | "draft" | "approved",
    };
    const bid = f.broker_id || null;
    const res = initial
      ? await supabase.from("properties").update(brokers ? { ...payload, broker_id: bid } : payload).eq("id", initial.id)
      : await supabase.from("properties").insert({ ...payload, broker_id: bid });
    setBusy(false);
    if (res.error) { toast.error(res.error.message); return; }
    toast.success(submit ? (brokers ? "تم النشر" : "تم إرسال الوحدة للمراجعة") : "تم الحفظ كمسودة");
    onDone();
  }

  return (
    <div className="rounded-2xl border bg-card p-4 md:p-6">
      <h3 className="mb-4 text-lg font-extrabold text-primary">{initial ? "تعديل وحدة مول" : "إضافة وحدة في مول"}</h3>
      {initial?.review_note && <p className="mb-4 rounded-xl bg-destructive/10 p-3 text-xs font-semibold text-destructive">ملاحظة الإدارة: {initial.review_note}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><Field label="اسم الوحدة"><input className={inputCls} value={f.title} onChange={set("title")} maxLength={150} placeholder="مثال: محل واجهة رئيسية" /></Field></div>
        <Field label="المول"><select className={inputCls} value={f.mall_id} onChange={set("mall_id")}><option value="">اختر المول</option>{malls.data?.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></Field>
        <Field label="نوع الوحدة"><select className={inputCls} value={f.type} onChange={set("type")}>{MALL_UNIT_TYPES.map((t) => <option key={t}>{t}</option>)}</select></Field>
        <Field label="الدور"><input className={inputCls} value={f.floor} onChange={set("floor")} maxLength={50} placeholder="مثال: الأرضي" /></Field>
        <Field label="الحالة"><select className={inputCls} value={f.status} onChange={set("status")}><option value="بيع">للبيع</option><option value="إيجار">للإيجار</option></select></Field>
        <Field label="المساحة (م²)"><input className={inputCls} inputMode="decimal" value={f.size} onChange={num("size")} /></Field>
        <Field label="السعر (ج.م)"><input className={inputCls} inputMode="numeric" value={f.price} onChange={num("price")} /></Field>
        {brokers && <Field label="الوسيط المسؤول"><select className={inputCls} value={f.broker_id} onChange={set("broker_id")}><option value="">اختر الوسيط</option>{brokers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>}
        <div className="sm:col-span-2"><Field label="الوصف"><textarea className={`${inputCls} h-24 py-2`} value={f.description} onChange={set("description")} maxLength={3000} /></Field></div>
        <div className="sm:col-span-2">
          <Field label="صورة الوحدة"><input type="file" accept="image/*" onChange={onImage} className="block w-full text-sm file:me-3 file:rounded-lg file:border-0 file:bg-secondary file:px-4 file:py-2 file:font-bold file:text-primary" /></Field>
          {f.image_url && <img src={f.image_url} alt="" className="mt-3 h-32 rounded-xl object-cover" />}
        </div>
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <button disabled={busy} onClick={() => save(true)} className={btnPrimary}>{brokers ? "حفظ ونشر" : "إرسال للمراجعة"}</button>
        <button disabled={busy} onClick={() => save(false)} className={btnOutline}>حفظ كمسودة</button>
        <button onClick={onCancel} className="h-11 px-4 text-sm font-bold text-muted-foreground hover:text-primary">إلغاء</button>
      </div>
    </div>
  );
}
