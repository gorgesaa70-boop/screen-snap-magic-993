import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, LayoutGrid } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { REVIEW, formatPrice } from "@/components/site/data";
import { projectCover, type ProjectRow } from "@/components/site/projects";
import { btnPrimary, btnOutline } from "@/components/site/ui";
import { ProjectForm } from "@/components/dash/ProjectForm";
import { ProjectUnits } from "@/components/dash/ProjectUnits";

export function MyProjects({ developerId }: { developerId: string }) {
  const q = useQuery({
    queryKey: ["my-projects", developerId],
    queryFn: async () => {
      const { data, error } = await dbx.from("projects").select("*, project_units(status)").eq("developer_id", developerId).order("updated_at", { ascending: false });
      if (error) throw error; return data;
    },
  });
  const [editing, setEditing] = useState<ProjectRow | "new" | null>(null);
  const [unitsOf, setUnitsOf] = useState<ProjectRow | null>(null);
  const reload = () => q.refetch();

  if (editing) return <ProjectForm developerId={developerId} initial={editing === "new" ? null : editing} onCancel={() => setEditing(null)} onDone={() => { setEditing(null); reload(); }} />;
  if (unitsOf) return <ProjectUnits project={unitsOf} onBack={() => { setUnitsOf(null); reload(); }} />;
  const list = q.data ?? [];
  return (
    <div className="space-y-3">
      <button onClick={() => setEditing("new")} className={btnPrimary}><Plus className="size-4" />إضافة مشروع</button>
      {!q.isLoading && list.length === 0 && <p className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">لسه ما ضفتش أي مشروع.</p>}
      {list.map((p) => {
        const available = p.project_units.filter((u) => u.status === "available").length;
        return (
          <div key={p.id} className="flex flex-col gap-3 rounded-2xl border bg-card p-3 sm:flex-row sm:items-center">
            <img src={projectCover(p)} alt="" loading="lazy" className="h-28 w-full rounded-xl object-cover sm:h-20 sm:w-28" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${REVIEW[p.review_status].cls}`}>{p.review_status === "rejected" ? "مخفي من الإدارة" : REVIEW[p.review_status].label}</span>
                {p.is_featured && <span className="rounded-full bg-teal px-2.5 py-0.5 text-[11px] font-bold text-accent-foreground">مميز</span>}
              </div>
              {p.review_status === "approved"
                ? <Link to="/projects/$id" params={{ id: p.id }} className="mt-1 block truncate font-bold text-primary hover:text-teal">{p.name}</Link>
                : <p className="mt-1 truncate font-bold text-primary">{p.name}</p>}
              <p className="text-sm text-muted-foreground">{p.area} · {formatPrice(p.project_units.length)} وحدة ({formatPrice(available)} متاحة)</p>
              {p.review_note && <p className="mt-1 text-xs text-destructive">{p.review_note}</p>}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setUnitsOf(p)} className={btnOutline}><LayoutGrid className="size-4" />الوحدات</button>
              <button aria-label="تعديل" onClick={() => setEditing(p)} className="grid size-11 place-items-center rounded-xl border text-primary hover:bg-secondary"><Pencil className="size-4" /></button>
              <button aria-label="حذف" onClick={async () => { if (!confirm("حذف المشروع وكل وحداته؟")) return; const { error } = await dbx.from("projects").delete().eq("id", p.id); if (error) toast.error(error.message); else reload(); }} className="grid size-11 place-items-center rounded-xl border text-destructive hover:bg-destructive/10"><Trash2 className="size-4" /></button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
