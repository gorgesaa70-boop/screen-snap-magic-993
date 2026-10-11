import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Field, inputCls, btnPrimary, btnOutline } from "@/components/site/ui";

export type TaskRow = Tables<"tasks"> & { leads?: { name: string; lead_no: number } | null };

export const useAssignable = () => useQuery({
  queryKey: ["assignable-users"],
  queryFn: async () => (await supabase.rpc("assignable_users")).data ?? [],
  staleTime: 5 * 60_000,
});

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" }) : "من غير ميعاد");

/** Add a task (optionally on a lead) for yourself or someone you're allowed to assign. */
export function NewTask({ leadId, onDone }: { leadId?: string; onDone: () => void }) {
  const people = useAssignable();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ title: "", due: "", to: "", notes: "" });
  const [busy, setBusy] = useState(false);
  async function save() {
    if (f.title.trim().length < 2) { toast.error("اكتب المهمة"); return; }
    const { data: u } = await supabase.auth.getUser();
    setBusy(true);
    const { error } = await supabase.from("tasks").insert({
      title: f.title.trim().slice(0, 200), notes: f.notes.trim().slice(0, 1000) || null, due_at: f.due ? new Date(f.due).toISOString() : null,
      assigned_to: f.to || u.user!.id, lead_id: leadId ?? null,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("اتضافت المهمة"); setF({ title: "", due: "", to: "", notes: "" }); setOpen(false); onDone();
  }
  if (!open) return <button onClick={() => setOpen(true)} className={btnOutline}><Plus className="size-4" />مهمة جديدة</button>;
  return (
    <div className="grid gap-2 rounded-xl border bg-card p-3 sm:grid-cols-3">
      <div className="sm:col-span-3"><Field label="المهمة"><input className={inputCls} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} maxLength={200} placeholder="مثال: ابعت للعميل عرض الأسعار" /></Field></div>
      <Field label="الميعاد"><input type="datetime-local" className={inputCls} value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} /></Field>
      <Field label="مسندة لـ"><select className={inputCls} value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })}>{(people.data ?? []).map((p) => <option key={p.user_id} value={p.label === "أنا" ? "" : p.user_id}>{p.label}</option>)}</select></Field>
      <Field label="ملاحظات"><input className={inputCls} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} maxLength={1000} /></Field>
      <div className="flex gap-2 sm:col-span-3">
        <button disabled={busy} onClick={save} className={btnPrimary}>حفظ</button>
        <button onClick={() => setOpen(false)} className="h-11 px-4 text-sm font-bold text-muted-foreground hover:text-primary">إلغاء</button>
      </div>
    </div>
  );
}

/** Task rows with a done checkbox; overdue ones are highlighted. */
export function TaskItems({ tasks, me, reload, showLead = true }: { tasks: TaskRow[]; me: string | undefined; reload: () => void; showLead?: boolean }) {
  const people = useAssignable();
  const name = (id: string) => (id === me ? "أنا" : people.data?.find((p) => p.user_id === id)?.label ?? "عضو");
  async function toggle(t: TaskRow) {
    const { error } = await supabase.from("tasks").update({ done_at: t.done_at ? null : new Date().toISOString() }).eq("id", t.id);
    if (error) toast.error(error.message); else reload();
  }
  if (tasks.length === 0) return <p className="text-sm text-muted-foreground">مفيش مهام.</p>;
  const now = Date.now();
  return (
    <ul className="space-y-2">
      {tasks.map((t) => {
        const late = !t.done_at && t.due_at && new Date(t.due_at).getTime() < now;
        return (
          <li key={t.id} className={`flex items-start gap-3 rounded-xl border p-3 text-sm ${late ? "border-destructive/50 bg-destructive/5" : "bg-card"} ${t.done_at ? "opacity-60" : ""}`}>
            <input type="checkbox" aria-label="تمت" checked={!!t.done_at} onChange={() => toggle(t)} className="mt-1 size-4 accent-[var(--color-primary)]" />
            <div className="min-w-0 flex-1">
              <p className={`font-bold text-primary ${t.done_at ? "line-through" : ""}`}>{t.title}</p>
              <p className={`text-xs ${late ? "font-bold text-destructive" : "text-muted-foreground"}`}>
                {late ? "متأخرة — " : ""}{when(t.due_at)} · {name(t.assigned_to)}
                {showLead && t.lead_id && t.leads && <> · <Link to="/leads/$id" params={{ id: t.lead_id }} className="font-bold text-primary underline">{t.leads.name}</Link></>}
              </p>
              {t.notes && <p className="mt-1 text-xs text-foreground/70">{t.notes}</p>}
            </div>
            {t.created_by === me && !t.done_at && (
              <button aria-label="حذف" onClick={async () => { if (!confirm("حذف المهمة؟")) return; const { error } = await supabase.from("tasks").delete().eq("id", t.id); if (error) toast.error(error.message); else reload(); }} className="text-destructive"><Trash2 className="size-4" /></button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Tasks section on a lead's page. */
export function LeadTasks({ leadId, me }: { leadId: string; me: string | undefined }) {
  const q = useQuery({
    queryKey: ["lead-tasks", leadId],
    queryFn: async () => ((await supabase.from("tasks").select("*").eq("lead_id", leadId).order("done_at", { nullsFirst: true }).order("due_at")).data ?? []) as TaskRow[],
  });
  return (
    <div className="space-y-3">
      <TaskItems tasks={q.data ?? []} me={me} reload={() => q.refetch()} showLead={false} />
      <NewTask leadId={leadId} onDone={() => q.refetch()} />
    </div>
  );
}
