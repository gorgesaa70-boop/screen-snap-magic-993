import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, LayoutDashboard, ArrowLeftRight, Star, CheckCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatPrice, type BrokerRow } from "@/components/site/data";
import { compoundCover, compoundWhere, type CompoundRow } from "@/components/site/compounds";
import { inputCls, btnPrimary, btnOutline } from "@/components/site/ui";
import { CompoundForm } from "./CompoundForm";
import { thumb } from "@/lib/images";

type Row = CompoundRow & { compound_units: { status: string }[] };

/** Admin: every compound — developer-owned or run by Value Aqar — hide/feature, hand over to a developer, open its dashboard. */
export function CompoundsAdmin({ brokers }: { brokers: BrokerRow[] }) {
  const developers = brokers.filter((b) => b.account_type === "developer" && b.is_active && !b.suspended_at).map((b) => ({ id: b.id, name: b.name }));
  const devName = (id: string | null) => brokers.find((b) => b.id === id)?.name;
  const q = useQuery({
    queryKey: ["compounds-admin"],
    queryFn: async () => {
      const { data, error } = await supabase.from("compounds").select("*, compound_units(status)").order("created_at", { ascending: false });
      if (error) throw error; return data as Row[];
    },
  });
  const nav = useNavigate();
  const [editing, setEditing] = useState<Row | "new" | null>(null);
  const [owner, setOwner] = useState("");
  const [search, setSearch] = useState("");
  const reload = () => q.refetch();

  // A new compound opens its dashboard (units map), like for developers.
  if (editing) return <CompoundForm developers={developers} initial={editing === "new" ? null : editing} onCancel={() => setEditing(null)}
    onDone={(id) => { const isNew = editing === "new"; setEditing(null); reload(); if (isNew) void nav({ to: "/my-compounds/$id", params: { id } }); }} />;

  async function update(c: Row, patch: Partial<CompoundRow>, ok: string) {
    const { error } = await supabase.from("compounds").update(patch).eq("id", c.id);
    if (error) toast.error(error.message); else { toast.success(ok); reload(); }
  }
  // Compounds a developer changed after being hidden come back as «رجع للمراجعة»: show them all at once.
  const waiting = (q.data ?? []).filter((c) => c.review_status === "pending");
  async function approveAll() {
    if (!confirm(`إظهار ${waiting.length} كمبوند مرة واحدة على الموقع؟`)) return;
    const { data, error } = await supabase.from("compounds").update({ review_status: "approved", review_note: null, is_active: true }).eq("review_status", "pending").select("id");
    if (error) { toast.error(error.message); return; }
    toast.success(`ظهر ${data?.length ?? 0} كمبوند`); reload();
  }
  const list = (q.data ?? []).filter((c) =>
    (!owner || (owner === "va" ? !c.developer_id : c.developer_id === owner)) && (!search || c.name.includes(search.trim())));

  return (
    <div className="space-y-3">
      <p className="max-w-3xl text-sm text-muted-foreground">
        الكمبوند ملك المطور. لو المطور لسه مش مشترك، ضيف الكمبوند واختار «فاليو عقار بتديره» واكتب اسم المطور، ووزّع عليه موظفين فاليو عقار.
        أول ما المطور يفتح حساب، اختار حسابه من «تسليم للمطور» — كل الوحدات والطلبات والسجل بيفضلوا زي ما هم.
      </p>
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setEditing("new")} className={btnPrimary}><Plus className="size-4" />إضافة كمبوند</button>
        {waiting.length > 0 && <button onClick={approveAll} className={btnOutline}><CheckCheck className="size-4" />اعتمد كل المستني ({waiting.length})</button>}
        <input aria-label="بحث" className={`${inputCls} w-auto min-w-40 flex-1`} placeholder="ابحث باسم الكمبوند" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select aria-label="صاحب الكمبوند" className={`${inputCls} w-auto`} value={owner} onChange={(e) => setOwner(e.target.value)}>
          <option value="">كل الكمبوندات</option><option value="va">اللي فاليو عقار بتديرها</option>
          {developers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </div>
      {!q.isLoading && list.length === 0 && <p className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">مفيش كمبوندات.</p>}
      {list.map((c) => {
        const u = c.compound_units;
        const visible = c.is_active && c.review_status === "approved";
        return (
          <div key={c.id} className="flex flex-col gap-3 rounded-2xl border bg-card p-3 lg:flex-row lg:items-center">
            <img src={thumb(compoundCover(c))} alt="" loading="lazy" className="h-28 w-full rounded-xl object-cover lg:h-20 lg:w-28" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap gap-1.5">
                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${visible ? "bg-teal-soft text-primary" : "bg-destructive/10 text-destructive"}`}>{visible ? "ظاهر" : c.review_status === "rejected" ? "مخفي من الإدارة" : c.review_status === "pending" ? "رجع للمراجعة" : "مخفي"}</span>
                <span className="rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-bold text-primary">{c.developer_id ? `المطور: ${devName(c.developer_id) ?? "—"}` : `فاليو عقار بتديره${c.developer_name ? ` لـ ${c.developer_name}` : ""}`}</span>
                {c.is_featured && <span className="rounded-full bg-teal px-2.5 py-0.5 text-[11px] font-bold text-accent-foreground">مميز</span>}
              </div>
              <p className="mt-1 truncate font-bold text-primary">{c.name}</p>
              <p className="text-sm text-muted-foreground">{compoundWhere(c)} · {formatPrice(u.length)} وحدة ({formatPrice(u.filter((x) => x.status === "available").length)} متاحة، {formatPrice(u.filter((x) => x.status === "sold").length)} مباعة)</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link to="/my-compounds/$id" params={{ id: c.id }} className={btnOutline}><LayoutDashboard className="size-4" />لوحة الكمبوند</Link>
              {!c.developer_id && developers.length > 0 && (
                <label className="flex items-center gap-1 text-xs font-bold text-primary">
                  <ArrowLeftRight className="size-4" />
                  <select aria-label="تسليم للمطور" className={`${inputCls} h-11 w-auto text-xs`} value="" onChange={(e) => {
                    const d = developers.find((x) => x.id === e.target.value);
                    if (d && confirm(`تسليم «${c.name}» لحساب ${d.name}؟ فريق فاليو عقار هيتشال من الكمبوند، والمطور هيوصله إشعار.`)) update(c, { developer_id: d.id, developer_name: null }, "اتسلم الكمبوند للمطور");
                  }}>
                    <option value="">تسليم للمطور…</option>{developers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </label>
              )}
              <button title="مميز" aria-label="مميز" onClick={() => update(c, { is_featured: !c.is_featured }, c.is_featured ? "اتشال من المميز" : "بقى مميز")} className={`grid size-11 place-items-center rounded-xl border ${c.is_featured ? "bg-teal text-accent-foreground" : "text-primary hover:bg-secondary"}`}><Star className="size-4" /></button>
              {visible
                ? <button className={btnOutline} onClick={() => { const note = prompt("سبب الإخفاء (بيوصل للمطور):") ?? ""; update(c, { review_status: "rejected", review_note: note.trim().slice(0, 500) || null }, "اتخفى الكمبوند"); }}>إخفاء</button>
                : <button className={btnOutline} onClick={() => update(c, { review_status: "approved", review_note: null, is_active: true }, "الكمبوند ظاهر")}>إظهار</button>}
              <button aria-label="تعديل" onClick={() => setEditing(c)} className="grid size-11 place-items-center rounded-xl border text-primary hover:bg-secondary"><Pencil className="size-4" /></button>
              <button aria-label="حذف" onClick={async () => { if (!confirm(`حذف «${c.name}» وكل وحداته وسجله؟ الطلبات بتفضل بس من غير ربط بالكمبوند.`)) return; const { error } = await supabase.from("compounds").delete().eq("id", c.id); if (error) toast.error(error.message); else reload(); }} className="grid size-11 place-items-center rounded-xl border text-destructive hover:bg-destructive/10"><Trash2 className="size-4" /></button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
