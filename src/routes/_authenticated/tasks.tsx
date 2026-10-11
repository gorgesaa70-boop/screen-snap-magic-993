import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { CalendarClock, AlarmClock, PhoneCall } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/useAuth";
import { DashShell } from "@/components/dash/DashShell";
import { NewTask, TaskItems, useAssignable, type TaskRow } from "@/components/dash/Tasks";
import { Stat } from "@/components/site/ui";
import { CLOSED_STAGES, STAGES, leadNo } from "@/components/site/data";

export const Route = createFileRoute("/_authenticated/tasks")({
  head: () => ({ meta: [{ title: "متابعاتي | فاليو عقار" }, { name: "robots", content: "noindex" }] }),
  component: TasksPage,
});

type LeadLite = { id: string; lead_no: number; name: string; phone: string; stage: string; follow_up_at: string | null; visit_at: string | null; assigned_staff_id: string | null };

function TasksPage() {
  const { me, user, loading } = useMe();
  const seeAll = !!me?.isAdmin || !!me?.isStaff;
  const allowed = seeAll || !!me?.broker;
  const [onlyMine, setOnlyMine] = useState(true);
  const leads = useQuery({
    queryKey: ["my-followups", onlyMine && seeAll],
    enabled: allowed,
    queryFn: async () => {
      let q = supabase.from("leads").select("id, lead_no, name, phone, stage, follow_up_at, visit_at, assigned_staff_id")
        .not("stage", "in", `(${CLOSED_STAGES.join(",")})`)
        .or(`follow_up_at.not.is.null,visit_at.not.is.null`);
      if (seeAll && onlyMine && user) q = q.eq("assigned_staff_id", user.id);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as LeadLite[];
    },
  });
  const tasks = useQuery({
    queryKey: ["tasks-all"], enabled: allowed,
    queryFn: async () => ((await supabase.from("tasks").select("*, leads(name, lead_no)").order("due_at", { nullsFirst: false })).data ?? []) as TaskRow[],
  });
  const people = useAssignable();

  const { today, overdue, visits } = useMemo(() => {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const end = new Date(start); end.setDate(end.getDate() + 1);
    const week = Date.now() + 7 * 864e5;
    const L = leads.data ?? [];
    const t = (s: string | null) => (s ? new Date(s).getTime() : NaN);
    return {
      today: L.filter((l) => t(l.follow_up_at) >= start.getTime() && t(l.follow_up_at) < end.getTime()),
      overdue: L.filter((l) => t(l.follow_up_at) < start.getTime()).sort((a, b) => t(a.follow_up_at) - t(b.follow_up_at)),
      visits: L.filter((l) => l.stage === "visit_scheduled" && t(l.visit_at) >= Date.now() && t(l.visit_at) <= week).sort((a, b) => t(a.visit_at) - t(b.visit_at)),
    };
  }, [leads.data]);
  const T = tasks.data ?? [];
  const mine = T.filter((x) => x.assigned_to === user?.id && !x.done_at);
  const team = T.filter((x) => x.assigned_to !== user?.id);
  const byPerson = useMemo(() => {
    const m = new Map<string, { open: number; late: number }>();
    for (const x of team) {
      if (x.done_at) continue;
      const e = m.get(x.assigned_to) ?? { open: 0, late: 0 };
      e.open++; if (x.due_at && new Date(x.due_at).getTime() < Date.now()) e.late++;
      m.set(x.assigned_to, e);
    }
    return [...m.entries()];
  }, [team]);

  if (loading) return <DashShell title="متابعاتي"><div className="h-40 animate-pulse rounded-2xl bg-muted" /></DashShell>;
  if (!allowed) return <DashShell title="متابعاتي"><p className="max-w-lg rounded-2xl border bg-card p-6 text-sm text-muted-foreground">الصفحة دي للوسطاء والشركات وفريق فاليو عقار.</p></DashShell>;
  const reload = () => { tasks.refetch(); };
  const card = "rounded-2xl border bg-card p-4";
  return (
    <DashShell title="متابعاتي" isAdmin={!!me?.isAdmin}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="متابعات النهارده" value={today.length} />
          <Stat label="متابعات متأخرة" value={overdue.length} />
          <Stat label="زيارات خلال أسبوع" value={visits.length} />
          <Stat label="مهامي المفتوحة" value={mine.length} hint={`${mine.filter((x) => x.due_at && new Date(x.due_at).getTime() < Date.now()).length} متأخرة`} />
        </div>
        {seeAll && (
          <label className="flex items-center gap-2 text-sm font-bold text-primary">
            <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} className="size-4" />العملاء المسندين ليا بس
          </label>
        )}
        <div className="grid gap-4 lg:grid-cols-2">
          <section className={card}>
            <h2 className="mb-2 flex items-center gap-1.5 font-extrabold text-primary"><PhoneCall className="size-4 text-teal" />مطلوب التواصل معاهم النهارده</h2>
            <LeadList rows={today} field="follow_up_at" empty="مفيش متابعات النهارده." />
          </section>
          <section className={card}>
            <h2 className="mb-2 flex items-center gap-1.5 font-extrabold text-destructive"><AlarmClock className="size-4" />متابعات متأخرة</h2>
            <LeadList rows={overdue} field="follow_up_at" empty="مفيش متأخرين ✓" late />
          </section>
          <section className={card}>
            <h2 className="mb-2 flex items-center gap-1.5 font-extrabold text-primary"><CalendarClock className="size-4 text-teal" />زيارات خلال الأسبوع</h2>
            <LeadList rows={visits} field="visit_at" empty="مفيش زيارات متحددة." />
          </section>
          <section className={card}>
            <div className="mb-2 flex items-center justify-between gap-2"><h2 className="font-extrabold text-primary">مهامي</h2><NewTask onDone={reload} /></div>
            <TaskItems tasks={mine} me={user?.id} reload={reload} />
          </section>
        </div>
        {team.length > 0 && (
          <section className={card}>
            <h2 className="mb-2 font-extrabold text-primary">مهام الفريق</h2>
            <div className="mb-3 flex flex-wrap gap-2">
              {byPerson.map(([id, s]) => (
                <span key={id} className={`rounded-full px-3 py-1 text-xs font-bold ${s.late ? "bg-destructive/10 text-destructive" : "bg-secondary text-primary"}`}>
                  {people.data?.find((p) => p.user_id === id)?.label ?? "عضو"}: {s.open} مفتوحة{s.late ? ` · ${s.late} متأخرة` : ""}
                </span>
              ))}
            </div>
            <TaskItems tasks={team.filter((x) => !x.done_at)} me={user?.id} reload={reload} />
          </section>
        )}
      </div>
    </DashShell>
  );
}

function LeadList({ rows, field, empty, late }: { rows: LeadLite[]; field: "follow_up_at" | "visit_at"; empty: string; late?: boolean }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="space-y-1.5 text-sm">
      {rows.slice(0, 50).map((l) => (
        <li key={l.id} className="flex flex-wrap items-center gap-x-2">
          <Link to="/leads/$id" params={{ id: l.id }} className="font-bold text-primary hover:text-teal">{l.name}</Link>
          <span className="text-xs text-muted-foreground" dir="ltr">{leadNo(l.lead_no)}</span>
          <span className="text-xs text-muted-foreground">{STAGES[l.stage] ?? l.stage}</span>
          <span className={`ms-auto text-xs ${late ? "font-bold text-destructive" : "text-muted-foreground"}`}>{l[field] ? new Date(l[field]!).toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "short" }) : ""}</span>
        </li>
      ))}
    </ul>
  );
}
