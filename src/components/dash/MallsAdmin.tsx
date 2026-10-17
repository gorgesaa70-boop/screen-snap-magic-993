import { useState } from "react";
import { MapPicker, type LatLng } from "@/components/site/MapPicker";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Store, FileSpreadsheet, CheckCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { REVIEW, formatPrice, type BrokerRow, type PropertyRow } from "@/components/site/data";
import { thumb } from "@/lib/images";
import { MallPhotosEditor, mallImages } from "./MallPhotos";
import { AvailabilitySelect, adminDelete } from "./ManageActions";
import { MALL_KINDS, fetchMalls, type MallRow } from "@/components/site/malls";
import { inputCls, btnPrimary, btnOutline } from "@/components/site/ui";
import { MallUnitForm } from "./MallUnitForm";
import { MallUnitsImport } from "./MallUnitsImport";

export function MallsAdmin({ properties, brokers, reload }: { properties: PropertyRow[]; brokers: BrokerRow[]; reload: () => void }) {
  const [editing, setEditing] = useState<PropertyRow | "new" | "import" | null>(null);
  const malls = useQuery({ queryKey: ["malls-all"], queryFn: () => fetchMalls(true) });
  const units = properties.filter((p) => p.category === "mall");
  const active = brokers.filter((b) => b.is_active).map((b) => ({ id: b.id, name: b.name }));
  const developers = brokers.filter((b) => b.account_type === "developer" && b.is_active).map((b) => ({ id: b.id, name: b.name }));
  const [name, setName] = useState("");
  if (editing === "import") return <MallUnitsImport brokers={active} onCancel={() => setEditing(null)} onDone={() => { setEditing(null); reload(); }} />;
  if (editing) return <MallUnitForm brokers={active} initial={editing === "new" ? null : editing} onCancel={() => setEditing(null)} onDone={() => { setEditing(null); reload(); }} />;
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border bg-card p-4">
        <h3 className="mb-3 font-extrabold text-primary">المولات</h3>
        <form className="mb-4 flex gap-2" onSubmit={async (e) => {
          e.preventDefault(); const n = name.trim(); if (n.length < 2) return;
          const { error } = await supabase.from("malls").insert({ name: n, sort_order: (malls.data?.length ?? 0) + 1 });
          if (error) toast.error(error.message.includes("duplicate") ? "المول موجود بالفعل" : error.message); else { setName(""); malls.refetch(); }
        }}>
          <input className={inputCls} placeholder="اسم مول جديد" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
          <button className={btnOutline}>إضافة</button>
        </form>
        <div className="space-y-3">{malls.data?.map((m) => <MallEditor key={m.id} m={m} developers={developers} units={units.filter((u) => u.mall_id === m.id).length} others={(malls.data ?? []).filter((x) => x.id !== m.id)} onSaved={() => malls.refetch()} onDeleted={() => { malls.refetch(); reload(); }} />)}</div>
      </div>
      <div className="space-y-3">
        <button onClick={() => setEditing("new")} className={btnPrimary}><Plus className="size-4" />إضافة وحدة في مول</button>
        <button onClick={() => setEditing("import")} className={btnOutline}><FileSpreadsheet className="size-4" />رفع وحدات من Excel</button>
        <ApproveMallUnits units={units} malls={malls.data ?? []} onDone={reload} />
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
              <AvailabilitySelect p={p} onChanged={reload} />
              <button aria-label="حذف" onClick={async () => { if (await adminDelete("property", p.id, p.title)) reload(); }} className="grid size-11 place-items-center rounded-xl border text-destructive hover:bg-destructive/10"><Trash2 className="size-4" /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** One click per mall: every unit still waiting (sent for review or saved as draft) becomes approved and shows on the site. */
function ApproveMallUnits({ units, malls, onDone }: { units: PropertyRow[]; malls: MallRow[]; onDone: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const waiting = malls
    .map((m) => ({ m, n: units.filter((u) => u.mall_id === m.id && (u.review_status === "pending" || u.review_status === "draft")).length }))
    .filter((x) => x.n > 0);
  if (!waiting.length) return null;
  async function approve(m: MallRow, n: number) {
    if (!confirm(`اعتماد ${n} وحدة في «${m.name}» مرة واحدة؟ هتظهر كلها على الموقع.`)) return;
    setBusy(m.id);
    const { data, error } = await supabase.from("properties").update({ review_status: "approved", review_note: null })
      .eq("category", "mall").eq("mall_id", m.id).in("review_status", ["pending", "draft"]).select("id");
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    toast.success(`اتعمد ${data?.length ?? 0} وحدة في ${m.name}`);
    onDone();
  }
  return (
    <div className="rounded-2xl border border-teal/40 bg-teal-soft/40 p-3">
      <p className="mb-2 text-sm font-bold text-primary">وحدات مستنية الاعتماد</p>
      <div className="flex flex-wrap gap-2">
        {waiting.map(({ m, n }) => (
          <button key={m.id} disabled={!!busy} onClick={() => approve(m, n)} className={`${btnPrimary} h-10`}>
            <CheckCheck className="size-4" />{busy === m.id ? "بيتعمد..." : `اعتمد كل وحدات ${m.name} (${n})`}
          </button>
        ))}
      </div>
    </div>
  );
}

function MallEditor({ m, developers, units, others, onSaved, onDeleted }: { m: MallRow; developers: { id: string; name: string }[]; units: number; others: MallRow[]; onSaved: () => void; onDeleted: () => void }) {
  const [deleting, setDeleting] = useState(false);
  const [moveTo, setMoveTo] = useState("");
  async function remove() {
    const r = await adminDelete("mall", m.id, m.name, {
      target: moveTo || undefined,
      extra: units ? (moveTo ? `الـ ${units} وحدة هيتنقلوا لـ «${others.find((o) => o.id === moveTo)?.name}».` : `الـ ${units} وحدة اللي فيه هيتمسحوا معاه (اللي عليها صفقة بتستخبى بس).`) : undefined,
    });
    if (r) onDeleted();
  }
  const [f, setF] = useState({ developer_id: m.developer_id ?? "", name: m.name, kind: m.kind ?? "commercial", location: m.location ?? "", description: m.description ?? "", images: mallImages(m) });
  const [loc, setLoc] = useState<LatLng | null>(m.lat != null && m.lng != null ? { lat: m.lat, lng: m.lng } : null);
  const [showMap, setShowMap] = useState(false);
  const [busy, setBusy] = useState(false);
  async function save(patch?: Partial<MallRow>) {
    setBusy(true);
    const base = { developer_id: f.developer_id || null, name: f.name.trim(), kind: f.kind, location: f.location.trim() || null, description: f.description.trim() || null, logo_url: f.images[0] ?? null, lat: loc?.lat ?? null, lng: loc?.lng ?? null };
    let { error } = await supabase.from("malls").update(patch ?? { ...base, images: f.images }).eq("id", m.id);
    // Before release 29 there is no gallery column: save the rest, with the first photo as the mall photo.
    if (error && !patch && /images/.test(error.message)) {
      ({ error } = await supabase.from("malls").update(base).eq("id", m.id));
      if (!error && f.images.length > 1) toast.info("اتحفظت أول صورة بس — باقي الصور محتاجة تحديث قاعدة البيانات (إصدار 29)");
    }
    setBusy(false);
    if (error) toast.error(error.message); else { toast.success("تم الحفظ"); onSaved(); }
  }
  return (
    <div className="rounded-xl border p-3">
      <div className="flex items-center gap-3">
        <span className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-2xl border bg-secondary" title="غلاف المول">
          {f.images[0] ? <img src={thumb(f.images[0])} alt={`صورة ${m.name}`} className="size-full object-cover" /> : <Store className="size-6 text-muted-foreground" />}
        </span>
        <div className="grid flex-1 gap-2">
          <input aria-label="اسم المول" className={`${inputCls} h-10`} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={120} />
          <select aria-label="نوع المول" className={`${inputCls} h-10`} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{Object.entries(MALL_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <input aria-label="الموقع" className={`${inputCls} h-10`} placeholder="الموقع" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} maxLength={300} />
          <select aria-label="المطور صاحب المول" className={`${inputCls} h-10`} value={f.developer_id} onChange={(e) => setF({ ...f, developer_id: e.target.value })}>
            <option value="">المطور: مش مربوط بحساب</option>
            {developers.map((d) => <option key={d.id} value={d.id}>المطور: {d.name}</option>)}
          </select>
        </div>
      </div>
      <textarea aria-label="الوصف" className={`${inputCls} mt-2 h-16 py-2`} placeholder="وصف المول" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} maxLength={2000} />
      <div className="mt-2"><MallPhotosEditor images={f.images} onChange={(images) => setF((x) => ({ ...x, images }))} disabled={busy} /></div>
      {f.images.join() !== mallImages(m).join() && <p className="mt-1 text-xs font-bold text-amber-700">الصور اتغيرت — اضغط «حفظ».</p>}
      <button type="button" onClick={() => setShowMap(!showMap)} className="mt-2 text-xs font-bold text-primary underline">📍 {loc ? "الموقع على الخريطة (متحدد)" : "حدد موقع المول على الخريطة"}</button>
      {showMap && <div className="mt-2"><MapPicker value={loc} onChange={setLoc} /><p className="mt-1 text-xs text-muted-foreground">وحدات المول اللي ملهاش موقع خاص بتاخد موقع المول.</p></div>}
      <div className="mt-2 flex flex-wrap gap-2">
        <button disabled={busy} onClick={() => save()} className={`${btnPrimary} h-10`}>حفظ</button>
        <button disabled={busy} onClick={() => save({ is_active: !m.is_active })} className={`h-10 rounded-xl px-3 text-xs font-bold ${m.is_active ? "bg-teal-soft text-primary" : "bg-muted text-muted-foreground"}`}>{m.is_active ? "ظاهر" : "مخفي"}</button>
        <button disabled={busy} onClick={() => (units ? setDeleting(!deleting) : remove())} className="inline-flex h-10 items-center gap-1 rounded-xl border border-destructive/40 px-3 text-xs font-bold text-destructive hover:bg-destructive/5"><Trash2 className="size-3.5" />حذف المول</button>
      </div>
      {deleting && (
        <div className="mt-2 space-y-2 rounded-xl bg-destructive/5 p-3">
          <p className="text-xs font-bold text-destructive">المول ده فيه {units} وحدة — تعمل فيهم إيه؟</p>
          <select aria-label="الوحدات" className={`${inputCls} h-10`} value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
            <option value="">امسح الوحدات مع المول</option>
            {others.map((o) => <option key={o.id} value={o.id}>انقلهم لـ {o.name}</option>)}
          </select>
          <button onClick={remove} className="h-10 rounded-xl bg-destructive px-4 text-xs font-bold text-destructive-foreground">احذف المول</button>
        </div>
      )}
    </div>
  );
}
