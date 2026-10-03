import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { REVIEW, formatPrice, type BrokerRow, type PropertyRow } from "@/components/site/data";
import { fetchActivities, fetchZones } from "@/components/site/industrial";
import { inputCls, btnPrimary, btnOutline } from "@/components/site/ui";
import { IndustrialForm } from "./IndustrialForm";

export function IndustrialAdmin({ properties, brokers, reload }: { properties: PropertyRow[]; brokers: BrokerRow[]; reload: () => void }) {
  const [editing, setEditing] = useState<PropertyRow | "new" | null>(null);
  const list = properties.filter((p) => p.category === "industrial");
  const active = brokers.filter((b) => b.is_active).map((b) => ({ id: b.id, name: b.name }));
  if (editing) return <IndustrialForm brokers={active} initial={editing === "new" ? null : editing} onCancel={() => setEditing(null)} onDone={() => { setEditing(null); reload(); }} />;
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <button onClick={() => setEditing("new")} className={btnPrimary}><Plus className="size-4" />إضافة عقار صناعي</button>
        {list.length === 0 && <p className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">لا توجد عقارات صناعية بعد.</p>}
        {list.map((p) => (
          <div key={p.id} className="flex flex-col gap-2 rounded-2xl border bg-card p-3 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${REVIEW[p.review_status].cls}`}>{REVIEW[p.review_status].label}</span>
              <p className="mt-1 truncate font-bold text-primary">{p.title}</p>
              <p className="text-sm text-muted-foreground">{formatPrice(Number(p.price))} ج.م · {p.type} · {p.area} · {brokers.find((b) => b.id === p.broker_id)?.name ?? "بدون وسيط"}</p>
            </div>
            <div className="flex gap-2">
              <button aria-label="تعديل" onClick={() => setEditing(p)} className="grid size-11 place-items-center rounded-xl border text-primary hover:bg-secondary"><Pencil className="size-4" /></button>
              <button aria-label="حذف" onClick={async () => { if (!confirm("حذف العقار؟")) return; const { error } = await supabase.from("properties").delete().eq("id", p.id); if (error) toast.error(error.message); else reload(); }} className="grid size-11 place-items-center rounded-xl border text-destructive hover:bg-destructive/10"><Trash2 className="size-4" /></button>
            </div>
          </div>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <ListEditor table="industrial_zones" title="المناطق الصناعية" />
        <ListEditor table="industrial_activities" title="أنواع النشاط" />
      </div>
    </div>
  );
}

function ListEditor({ table, title }: { table: "industrial_zones" | "industrial_activities"; title: string }) {
  const key = table === "industrial_zones" ? "ind-zones-all" : "ind-acts-all";
  const q = useQuery({ queryKey: [key], queryFn: () => (table === "industrial_zones" ? fetchZones(true) : fetchActivities(true)) });
  const [name, setName] = useState("");
  const rows = q.data ?? [];
  const done = (error: { message: string } | null) => { if (error) toast.error(error.message.includes("duplicate") ? "الاسم موجود بالفعل" : error.message); else q.refetch(); };
  return (
    <div className="rounded-2xl border bg-card p-4">
      <h3 className="mb-3 font-extrabold text-primary">{title}</h3>
      <form className="mb-3 flex gap-2" onSubmit={async (e) => {
        e.preventDefault(); const n = name.trim(); if (n.length < 2) return;
        const { error } = await supabase.from(table).insert({ name: n, sort_order: rows.length + 1 }); setName(""); done(error);
      }}>
        <input className={inputCls} placeholder="إضافة اسم جديد" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
        <button className={btnOutline}>إضافة</button>
      </form>
      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center gap-2">
            <input aria-label="الاسم" className={`${inputCls} h-10`} defaultValue={r.name} maxLength={120}
              onBlur={async (e) => { const n = e.target.value.trim(); if (n.length < 2 || n === r.name) return; const { error } = await supabase.from(table).update({ name: n }).eq("id", r.id); done(error); }} />
            <button onClick={async () => { const { error } = await supabase.from(table).update({ is_active: !r.is_active }).eq("id", r.id); done(error); }}
              className={`h-10 shrink-0 rounded-xl px-3 text-xs font-bold ${r.is_active ? "bg-teal-soft text-primary" : "bg-muted text-muted-foreground"}`}>{r.is_active ? "مفعّل" : "مخفي"}</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
