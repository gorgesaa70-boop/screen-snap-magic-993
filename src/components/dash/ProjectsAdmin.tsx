import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { dbx } from "@/lib/dbx";
import { REVIEW, formatPrice, type BrokerRow } from "@/components/site/data";
import { projectCover } from "@/components/site/projects";
import { btnPrimary, btnOutline } from "@/components/site/ui";
import { useState } from "react";
import { FileSpreadsheet, CheckCheck, Pencil } from "lucide-react";
import { ProjectForm } from "@/components/dash/ProjectForm";
import { DeleteButton } from "@/components/dash/ManageActions";
import { ProjectsImport } from "@/components/dash/ProjectsImport";
import { thumb } from "@/lib/images";

/** Admin view of every project: approve hidden ones, hide with a note, or feature. */
export function ProjectsAdmin({ brokers }: { brokers: BrokerRow[] }) {
  const q = useQuery({
    queryKey: ["admin-projects"],
    queryFn: async () => {
      const { data, error } = await dbx.from("projects").select("*, project_units(status)").order("updated_at", { ascending: false });
      if (error) throw error; return data;
    },
  });
  const upd = async (id: string, patch: { review_status?: "approved" | "rejected"; review_note?: string | null; is_featured?: boolean }, msg: string) => {
    const { error } = await dbx.from("projects").update(patch).eq("id", id);
    if (error) toast.error(error.message); else { toast.success(msg); q.refetch(); }
  };
  const list = q.data ?? [];
  const [importing, setImporting] = useState(false);
  const [editing, setEditing] = useState<(typeof list)[number] | null>(null);
  const developers = brokers.filter((b) => b.account_type === "developer" && b.is_active).map((b) => ({ id: b.id, name: b.name }));
  if (editing) return <ProjectForm developerId={editing.developer_id} initial={editing} onCancel={() => setEditing(null)} onDone={() => { setEditing(null); q.refetch(); }} />;
  if (importing) return <ProjectsImport developers={developers} onCancel={() => setImporting(false)} onDone={() => { setImporting(false); q.refetch(); }} />;
  const importBtn = developers.length > 0 && <button onClick={() => setImporting(true)} className={btnOutline}><FileSpreadsheet className="size-4" />رفع كمبوندات من Excel</button>;
  if (!q.isLoading && list.length === 0) return <div className="space-y-3">{importBtn}<p className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">لا توجد مشروعات بعد. شركات التطوير المعتمدة تضيف مشروعاتها من لوحتها.</p></div>;
  const waiting = list.filter((p) => p.review_status === "pending");
  async function approveAll() {
    if (!confirm(`نشر ${waiting.length} مشروع مرة واحدة؟ هيظهروا كلهم على الموقع.`)) return;
    const { data, error } = await dbx.from("projects").update({ review_status: "approved", review_note: null }).eq("review_status", "pending").select("id");
    if (error) { toast.error(error.message); return; }
    toast.success(`اتنشر ${data?.length ?? 0} مشروع`); q.refetch();
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {importBtn}
        {waiting.length > 0 && <button onClick={approveAll} className={btnPrimary}><CheckCheck className="size-4" />انشر كل المستني ({waiting.length})</button>}
      </div>
      {list.map((p) => {
        const dev = brokers.find((b) => b.id === p.developer_id);
        return (
          <div key={p.id} className="flex flex-col gap-3 rounded-2xl border bg-card p-3 md:flex-row md:items-center">
            <img src={thumb(projectCover(p))} alt="" loading="lazy" className="h-28 w-full rounded-xl object-cover md:h-20 md:w-28" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${REVIEW[p.review_status].cls}`}>{p.review_status === "rejected" ? "مخفي" : REVIEW[p.review_status].label}</span>
                {p.is_featured && <span className="rounded-full bg-teal px-2.5 py-0.5 text-[11px] font-bold text-accent-foreground">مميز</span>}
              </div>
              <Link to="/projects/$id" params={{ id: p.id }} className="mt-1 block truncate font-bold text-primary hover:text-teal">{p.name}</Link>
              <p className="text-sm text-muted-foreground">{dev?.name ?? "—"} · {p.area} · {formatPrice(p.project_units.length)} وحدة</p>
              {p.review_note && <p className="mt-1 text-xs text-destructive">{p.review_note}</p>}
            </div>
            <div className="flex flex-wrap gap-2">
              <button aria-label={p.is_featured ? "إلغاء التمييز" : "تمييز"} title={p.is_featured ? "إلغاء التمييز" : "تمييز"} onClick={() => upd(p.id, { is_featured: !p.is_featured }, p.is_featured ? "تم إلغاء التمييز" : "تم تمييز المشروع")} className={`grid size-11 place-items-center rounded-xl border ${p.is_featured ? "bg-teal text-accent-foreground" : "text-primary hover:bg-secondary"}`}><Star className="size-4" /></button>
              {p.review_status === "approved" ? (
                <button className={btnOutline} onClick={() => { const note = prompt("سبب الإخفاء (هيظهر لشركة التطوير):"); if (note === null) return; upd(p.id, { review_status: "rejected", review_note: note.trim().slice(0, 500) || null }, "تم إخفاء المشروع"); }}>إخفاء</button>
              ) : (
                <button className={btnPrimary} onClick={() => upd(p.id, { review_status: "approved", review_note: null }, "تم نشر المشروع")}>نشر</button>
              )}
              <button className={btnOutline} onClick={() => setEditing(p)}><Pencil className="size-4" />تعديل</button>
              <DeleteButton kind="project" id={p.id} name={p.name} extra={p.project_units.length ? `وحداته (${p.project_units.length}) هتتمسح معاه.` : undefined} onDone={() => q.refetch()} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
