import { useState } from "react";
import { MapPicker, type LatLng } from "@/components/site/MapPicker";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Building2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { REVIEW, formatPrice, uploadImage, type PropertyRow } from "@/components/site/data";
import { fetchCompounds, type CompoundRow } from "@/components/site/compounds";
import { inputCls, btnPrimary, btnOutline } from "@/components/site/ui";
import { PropertyForm } from "./PropertyForm";

export function CompoundsAdmin({ properties, reload }: { properties: PropertyRow[]; reload: () => void }) {
  const [editing, setEditing] = useState<PropertyRow | null>(null);
  const compounds = useQuery({ queryKey: ["compounds-all"], queryFn: () => fetchCompounds(true) });
  const units = properties.filter((p) => p.compound_id);
  const [name, setName] = useState("");
  if (editing) return <PropertyForm brokerId={editing.broker_id ?? ""} initial={editing} onCancel={() => setEditing(null)} onDone={() => { setEditing(null); reload(); }} />;
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border bg-card p-4">
        <h3 className="mb-3 font-extrabold text-primary">الكمبوندات</h3>
        <form className="mb-4 flex gap-2" onSubmit={async (e) => {
          e.preventDefault(); const n = name.trim(); if (n.length < 2) return;
          const { error } = await supabase.from("compounds").insert({ name: n, sort_order: (compounds.data?.length ?? 0) + 1 });
          if (error) toast.error(error.message.includes("duplicate") ? "الكمبوند موجود بالفعل" : error.message); else { setName(""); compounds.refetch(); }
        }}>
          <input className={inputCls} placeholder="اسم كمبوند جديد" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
          <button className={btnOutline}>إضافة</button>
        </form>
        <div className="space-y-3">{compounds.data?.map((c) => <CompoundEditor key={c.id} c={c} onSaved={() => compounds.refetch()} />)}</div>
      </div>
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">وحدات الكمبوندات بتتضاف من نموذج العقار العادي باختيار «الكمبوند» — وبتظهر هنا وبتنزل للمراجعة زي أي عقار.</p>
        {units.length === 0 && <p className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">لا توجد وحدات بعد.</p>}
        {units.map((p) => (
          <div key={p.id} className="flex flex-col gap-2 rounded-2xl border bg-card p-3 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${REVIEW[p.review_status].cls}`}>{REVIEW[p.review_status].label}</span>
              <p className="mt-1 truncate font-bold text-primary">{p.title}</p>
              <p className="text-sm text-muted-foreground">{formatPrice(Number(p.price))} ج.م · {p.type} · {p.area}</p>
            </div>
            <div className="flex gap-2">
              <button aria-label="تعديل" onClick={() => setEditing(p)} className="grid size-11 place-items-center rounded-xl border text-primary hover:bg-secondary"><Pencil className="size-4" /></button>
              <button aria-label="حذف" onClick={async () => { if (!confirm("حذف الوحدة؟")) return; const { error } = await supabase.from("properties").delete().eq("id", p.id); if (error) toast.error(error.message); else reload(); }} className="grid size-11 place-items-center rounded-xl border text-destructive hover:bg-destructive/10"><Trash2 className="size-4" /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CompoundEditor({ c, onSaved }: { c: CompoundRow; onSaved: () => void }) {
  const [f, setF] = useState({ name: c.name, location: c.location ?? "", description: c.description ?? "", logo_url: c.logo_url ?? "" });
  const [loc, setLoc] = useState<LatLng | null>(c.lat != null && c.lng != null ? { lat: c.lat, lng: c.lng } : null);
  const [showMap, setShowMap] = useState(false);
  const [busy, setBusy] = useState(false);
  async function save(patch?: Partial<CompoundRow>) {
    setBusy(true);
    const { error } = await supabase.from("compounds").update(patch ?? { name: f.name.trim(), location: f.location.trim() || null, description: f.description.trim() || null, logo_url: f.logo_url || null, lat: loc?.lat ?? null, lng: loc?.lng ?? null }).eq("id", c.id);
    setBusy(false);
    if (error) toast.error(error.message); else { toast.success("تم الحفظ"); onSaved(); }
  }
  return (
    <div className="rounded-xl border p-3">
      <div className="flex items-center gap-3">
        <label className="flex w-24 shrink-0 cursor-pointer flex-col items-center gap-1" title="صورة الكمبوند">
          <span className="grid size-20 place-items-center overflow-hidden rounded-2xl border-2 border-dashed border-teal/60 bg-secondary">
            {f.logo_url ? <img src={f.logo_url} alt={`صورة ${c.name}`} className="size-full object-cover" /> : <Building2 className="size-6 text-muted-foreground" />}
          </span>
          <span className="text-[11px] font-bold text-primary">{f.logo_url ? "غيّر الصورة" : "ارفع صورة الكمبوند"}</span>
          <input type="file" accept="image/*" className="sr-only" onChange={async (e) => {
            const file = e.target.files?.[0]; if (!file) return;
            try { setBusy(true); const url = await uploadImage(file); setF((x) => ({ ...x, logo_url: url })); toast.success("الصورة اترفعت — اضغط حفظ"); } catch (err) { toast.error((err as Error).message); } finally { setBusy(false); }
          }} />
        </label>
        <div className="grid flex-1 gap-2">
          <input aria-label="اسم الكمبوند" className={`${inputCls} h-10`} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={120} />
          <input aria-label="الموقع" className={`${inputCls} h-10`} placeholder="الموقع" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} maxLength={300} />
        </div>
      </div>
      <textarea aria-label="الوصف" className={`${inputCls} mt-2 h-16 py-2`} placeholder="وصف الكمبوند" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} maxLength={2000} />
      <button type="button" onClick={() => setShowMap(!showMap)} className="mt-2 text-xs font-bold text-primary underline">📍 {loc ? "الموقع على الخريطة (متحدد)" : "حدد موقع الكمبوند على الخريطة"}</button>
      {showMap && <div className="mt-2"><MapPicker value={loc} onChange={setLoc} /><p className="mt-1 text-xs text-muted-foreground">وحدات الكمبوند اللي ملهاش موقع خاص بتاخد موقع الكمبوند.</p></div>}
      <div className="mt-2 flex gap-2">
        <button disabled={busy} onClick={() => save()} className={`${btnPrimary} h-10`}>حفظ</button>
        <button disabled={busy} onClick={() => save({ is_active: !c.is_active })} className={`h-10 rounded-xl px-3 text-xs font-bold ${c.is_active ? "bg-teal-soft text-primary" : "bg-muted text-muted-foreground"}`}>{c.is_active ? "ظاهر" : "مخفي"}</button>
      </div>
    </div>
  );
}
