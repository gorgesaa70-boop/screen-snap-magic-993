import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { staffDirectory } from "@/lib/admin.functions";
import { Stat, Tabs, inputCls, btnOutline } from "@/components/site/ui";
import { CLOSED_STAGES, LEAD_SOURCES, STAGES, formatPrice } from "@/components/site/data";
import { displayStatus, remaining } from "@/lib/finance";
import { formatWorkMinutes, workMinutes } from "@/lib/response-time";

/**
 * Dashboard home + reports (item 19). Everything is computed from real rows the viewer may see —
 * row-level security already scopes companies and team members to their own data.
 * Sales value (property prices) is always shown apart from Value Aqar revenue (commissions collected).
 */
type Scope = { seeAll: boolean; isAdmin: boolean; companyId: string | null };
type Period = "month" | "3m" | "year" | "all" | "custom";
const ORDER = ["new", "contacted", "qualified", "visit_scheduled", "visited", "reserved", "contracted", "sold"];
const REACHED = (stage: string, step: string) => ORDER.indexOf(stage) >= ORDER.indexOf(step);
const money = (n: number) => `${formatPrice(Math.round(n))} ج.م`;
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");
const month = (d: string) => d.slice(0, 7);

function useReportData(scope: Scope) {
  const listStaff = useServerFn(staffDirectory);
  return useQuery({
    queryKey: ["reports-data", scope.seeAll, scope.companyId],
    queryFn: async () => {
      const [leads, deals, comms, pays, units, projects, members, brokers, staff, settings] = await Promise.all([
        supabase.from("leads").select("id, created_at, stage, source, area, assigned_broker_id, assigned_member_id, assigned_staff_id, follow_up_at, first_referred_at, referred_at, first_response_at"),
        supabase.from("deals").select("id, lead_id, broker_id, project_unit_id, deal_type, sale_value, sale_date, review_status, reservation_date, contract_date, created_at"),
        supabase.from("commissions").select("id, deal_id, broker_id, expected_amount, paid_amount, status, due_date, approved_at, created_at"),
        supabase.from("commission_payments").select("commission_id, amount, paid_on"),
        supabase.from("project_units").select("id, project_id"),
        supabase.from("projects").select("id, name"),
        supabase.from("company_members").select("id, name, company_id"),
        scope.seeAll ? supabase.rpc("admin_brokers") : supabase.rpc("my_account"),
        scope.seeAll ? listStaff().then((r) => (r.ok ? r.staff : [])) : Promise.resolve([]),
        supabase.from("app_settings").select("response_sla_minutes, work_start_hour, work_end_hour").eq("id", 1).maybeSingle(),
      ]);
      const err = leads.error || deals.error;
      if (err) throw err;
      return {
        leads: leads.data ?? [], deals: deals.data ?? [], comms: comms.data ?? [], pays: pays.data ?? [],
        unitProject: new Map((units.data ?? []).map((u) => [u.id, u.project_id])), projects: projects.data ?? [],
        members: members.data ?? [], brokers: brokers.data ?? [], staff,
        sla: { minutes: settings.data?.response_sla_minutes ?? 60, start: settings.data?.work_start_hour ?? 9, end: settings.data?.work_end_hour ?? 21 },
      };
    },
  });
}

function csv(name: string, head: string[], rows: (string | number)[][]) {
  const esc = (v: unknown) => { const t = String(v ?? ""); return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  const blob = new Blob(["﻿" + [head, ...rows].map((r) => r.map(esc).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(a.href);
}

function Table({ name, head, rows }: { name: string; head: string[]; rows: (string | number)[][] }) {
  if (!rows.length) return <p className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">مفيش بيانات في الفترة دي.</p>;
  return (
    <div className="space-y-2">
      <div className="flex justify-end"><button onClick={() => csv(name, head, rows)} className={btnOutline}><Download className="size-4" />تصدير CSV</button></div>
      <div className="overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-secondary text-primary"><tr>{head.map((h) => <th key={h} className="p-3 text-start font-bold">{h}</th>)}</tr></thead>
          <tbody>{rows.map((r, i) => <tr key={i} className="border-t">{r.map((c, j) => <td key={j} className={`p-3 ${j === 0 ? "font-bold text-primary" : ""}`}>{c}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}

export function Reports({ scope }: { scope: Scope }) {
  const q = useReportData(scope);
  const [tab, setTab] = useState<"overview" | "sources" | "companies" | "people" | "finance">("overview");
  const [period, setPeriod] = useState<Period>("3m");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [f, setF] = useState({ company: "", project: "", source: "", person: "", stage: "", area: "" });

  const range = useMemo(() => {
    const today = new Date(); const iso = (d: Date) => d.toISOString().slice(0, 10);
    if (period === "custom") return { from: from || "0000", to: to || "9999" };
    if (period === "all") return { from: "0000", to: "9999" };
    const start = new Date(today);
    if (period === "month") start.setDate(1);
    if (period === "3m") start.setMonth(start.getMonth() - 3);
    if (period === "year") { start.setMonth(0); start.setDate(1); }
    return { from: iso(start), to: iso(today) };
  }, [period, from, to]);

  const d = q.data;
  const view = useMemo(() => {
    if (!d) return null;
    const inRange = (x: string | null | undefined) => !!x && x.slice(0, 10) >= range.from && x.slice(0, 10) <= range.to;
    const leadById = new Map(d.leads.map((l) => [l.id, l]));
    const projectOfDeal = (dl: (typeof d.deals)[number]) => (dl.project_unit_id ? d.unitProject.get(dl.project_unit_id) ?? "" : "");
    const personOf = (l: (typeof d.leads)[number]) => l.assigned_member_id ?? l.assigned_staff_id ?? "";
    const leadOk = (l: (typeof d.leads)[number]) =>
      (!f.company || l.assigned_broker_id === f.company) && (!f.source || l.source === f.source) && (!f.person || personOf(l) === f.person)
      && (!f.stage || l.stage === f.stage) && (!f.area || l.area === f.area);
    const dealOk = (dl: (typeof d.deals)[number]) => {
      const l = leadById.get(dl.lead_id);
      return (!f.company || dl.broker_id === f.company) && (!f.project || projectOfDeal(dl) === f.project)
        && (!l || ((!f.source || l.source === f.source) && (!f.person || personOf(l) === f.person) && (!f.area || l.area === f.area)));
    };
    const leads = d.leads.filter((l) => inRange(l.created_at) && leadOk(l) && (!f.project || d.deals.some((dl) => dl.lead_id === l.id && projectOfDeal(dl) === f.project)));
    const deals = d.deals.filter(dealOk);
    const sales = deals.filter((dl) => dl.review_status === "approved" && inRange(dl.sale_date));
    const dealIds = new Set(deals.map((x) => x.id));
    const comms = d.comms.filter((c) => dealIds.has(c.deal_id));
    const commIds = new Set(comms.map((c) => c.id));
    const pays = d.pays.filter((p) => commIds.has(p.commission_id) && inRange(p.paid_on));
    return { leads, deals, sales, comms, pays, leadById, projectOfDeal, personOf, inRange };
  }, [d, range, f]);

  const names = useMemo(() => {
    const m = new Map<string, string>();
    d?.brokers.forEach((b) => m.set(b.id, b.name));
    d?.members.forEach((x) => m.set(x.id, x.name));
    d?.staff.forEach((s) => m.set(s.userId, `${s.name} (فاليو عقار)`));
    d?.projects.forEach((p) => m.set(p.id, p.name));
    return m;
  }, [d]);
  const nameOf = (id: string | null | undefined, fallback = "—") => (id ? names.get(id) ?? fallback : fallback);

  if (q.isLoading) return <div className="h-60 animate-pulse rounded-2xl bg-muted" />;
  if (q.error || !d || !view) return <p className="rounded-2xl border bg-card p-6 text-sm text-destructive">تعذّر تحميل التقارير.</p>;

  const L = view.leads;
  const sold = L.filter((l) => l.stage === "sold").length;
  // Sales and rentals are reported apart: property sale values vs. rent contract / booking values.
  const saleDeals = view.sales.filter((x) => x.deal_type === "sale");
  const rentDeals = view.sales.filter((x) => x.deal_type !== "sale");
  const salesValue = saleDeals.reduce((s, x) => s + Number(x.sale_value ?? 0), 0);
  const rentValue = rentDeals.reduce((s, x) => s + Number(x.sale_value ?? 0), 0);
  const collected = view.pays.reduce((s, p) => s + Number(p.amount), 0);
  const approvedComm = view.comms.filter((c) => view.inRange(c.approved_at)).reduce((s, c) => s + Number(c.expected_amount ?? 0), 0);
  const outstanding = view.comms.filter((c) => !["expected", "pending_review", "cancelled"].includes(c.status)).reduce((s, c) => s + remaining(c), 0);
  const overdue = view.comms.filter((c) => displayStatus(c) === "due").reduce((s, c) => s + remaining(c), 0);
  const today = Date.now();

  // Monthly series: new leads and revenue collected.
  const months = new Map<string, { m: string; leads: number; revenue: number; sales: number }>();
  const bump = (k: string) => { if (!months.has(k)) months.set(k, { m: k, leads: 0, revenue: 0, sales: 0 }); return months.get(k)!; };
  L.forEach((l) => bump(month(l.created_at)).leads++);
  view.pays.forEach((p) => { bump(month(p.paid_on)).revenue += Number(p.amount); });
  saleDeals.forEach((x) => { bump(month(x.sale_date!)).sales += Number(x.sale_value ?? 0); });
  const series = [...months.values()].sort((a, b) => a.m.localeCompare(b.m));
  const funnel = ORDER.map((s) => ({ stage: STAGES[s], count: L.filter((l) => REACHED(l.stage, s)).length }));

  // Response time (working hours): average for answered leads, and the share answered within the SLA.
  const response = (ls: typeof L) => {
    const hours = { start: d.sla.start, end: d.sla.end };
    const referred = ls.filter((l) => l.referred_at);
    const answered = referred.filter((l) => l.first_response_at).map((l) => workMinutes(l.referred_at!, l.first_response_at!, hours));
    const due = referred.filter((l) => l.first_response_at || workMinutes(l.referred_at!, new Date(), hours) > d.sla.minutes);
    const onTime = answered.filter((m) => m <= d.sla.minutes).length;
    return [answered.length ? formatWorkMinutes(Math.round(answered.reduce((a, b) => a + b, 0) / answered.length)) : "—", pct(onTime, due.length)] as const;
  };
  const group = <K extends string>(rows: typeof L, key: (l: (typeof L)[number]) => K) => {
    const m = new Map<K, typeof L>();
    rows.forEach((l) => { const k = key(l); m.set(k, [...(m.get(k) ?? []), l]); });
    return [...m.entries()];
  };
  const opts = (ids: (string | null | undefined)[]) => [...new Set(ids.filter(Boolean) as string[])].map((id) => [id, nameOf(id)] as const).sort((a, b) => a[1].localeCompare(b[1]));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2 rounded-2xl border bg-card p-3">
        <select aria-label="الفترة" className={`${inputCls} w-auto`} value={period} onChange={(e) => setPeriod(e.target.value as Period)}>
          <option value="month">الشهر ده</option><option value="3m">آخر 3 شهور</option><option value="year">السنة دي</option><option value="all">كل الفترات</option><option value="custom">فترة محددة</option>
        </select>
        {period === "custom" && <>
          <input type="date" aria-label="من" className={`${inputCls} w-auto`} value={from} onChange={(e) => setFrom(e.target.value)} />
          <input type="date" aria-label="إلى" className={`${inputCls} w-auto`} value={to} onChange={(e) => setTo(e.target.value)} />
        </>}
        {scope.seeAll && <select aria-label="الشركة" className={`${inputCls} w-auto`} value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })}><option value="">كل الشركات</option>{opts(d.leads.map((l) => l.assigned_broker_id)).map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select>}
        {d.projects.length > 0 && <select aria-label="المشروع" className={`${inputCls} w-auto`} value={f.project} onChange={(e) => setF({ ...f, project: e.target.value })}><option value="">كل المشروعات</option>{d.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>}
        <select aria-label="المصدر" className={`${inputCls} w-auto`} value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })}><option value="">كل المصادر</option>{Object.entries(LEAD_SOURCES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <select aria-label="الموظف" className={`${inputCls} w-auto`} value={f.person} onChange={(e) => setF({ ...f, person: e.target.value })}><option value="">كل الموظفين</option>{opts(d.leads.map((l) => l.assigned_member_id ?? l.assigned_staff_id)).map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select>
        <select aria-label="الحالة" className={`${inputCls} w-auto`} value={f.stage} onChange={(e) => setF({ ...f, stage: e.target.value })}><option value="">كل المراحل</option>{Object.entries(STAGES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <select aria-label="المنطقة" className={`${inputCls} w-auto`} value={f.area} onChange={(e) => setF({ ...f, area: e.target.value })}><option value="">كل المناطق</option>{[...new Set(d.leads.map((l) => l.area).filter(Boolean) as string[])].sort().map((a) => <option key={a} value={a}>{a}</option>)}</select>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="العملاء في الفترة" value={L.length} hint={`${L.filter((l) => l.stage === "new").length} جديد · ${L.filter((l) => !CLOSED_STAGES.includes(l.stage)).length} قيد المتابعة`} />
        <Stat label="بيع / إيجار مؤكد" value={sold} hint={`نسبة التحويل ${pct(sold, L.length)}`} />
        <Stat label="قيمة المبيعات المعتمدة" value={money(salesValue)} hint={`${saleDeals.length} بيع — قيمة عقارات، مش إيراد`} />
        <Stat label="عقود إيجار ومصيف مؤكدة" value={rentDeals.length} hint={`قيمتها ${money(rentValue)} — مش إيراد`} />
        <Stat label="صفقات بانتظار المراجعة" value={view.deals.filter((x) => x.review_status === "pending").length} />
        <Stat label="إيرادات فاليو عقار (محصّلة)" value={money(collected)} hint="دفعات العمولات في الفترة" />
        <Stat label="عمولات اتعتمدت" value={money(approvedComm)} />
        <Stat label="متبقي للتحصيل" value={money(outstanding)} hint={overdue ? `منها ${money(overdue)} متأخرة` : undefined} />
        {scope.seeAll
          ? <Stat label="الحسابات النشطة" value={d.brokers.filter((b) => b.is_active).length} hint={`${d.brokers.filter((b) => !b.is_active && !b.rejected_at && !b.suspended_at).length} طلب انضمام مستني`} />
          : <Stat label="متابعات متأخرة" value={L.filter((l) => l.follow_up_at && new Date(l.follow_up_at).getTime() < today && !CLOSED_STAGES.includes(l.stage)).length} />}
      </div>

      <Tabs<typeof tab> value={tab} onChange={setTab} tabs={[
        { id: "overview", label: "نظرة عامة" }, { id: "sources", label: "مصادر العملاء" },
        ...(scope.seeAll ? [{ id: "companies" as const, label: "أداء الشركات" }] : []),
        { id: "people", label: "أداء الموظفين" }, { id: "finance", label: "التقرير المالي" },
      ]} />

      {tab === "overview" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border bg-card p-4">
            <p className="mb-2 font-bold text-primary">مسار العملاء (وصلوا للمرحلة دي أو بعدها)</p>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={funnel} layout="vertical" margin={{ left: 24 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" allowDecimals={false} />
                <YAxis type="category" dataKey="stage" width={96} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" name="عملاء" fill="var(--color-primary)" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="rounded-2xl border bg-card p-4">
            <p className="mb-2 font-bold text-primary">كل شهر: عملاء جداد وإيرادات محصّلة</p>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={series}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="m" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="l" allowDecimals={false} />
                <YAxis yAxisId="r" orientation="right" tickFormatter={(v: number) => formatPrice(v)} />
                <Tooltip formatter={(v: number, n: string) => (n === "إيرادات" ? money(v) : v)} />
                <Legend />
                <Bar yAxisId="l" dataKey="leads" name="عملاء" fill="var(--color-primary)" radius={[6, 6, 0, 0]} />
                <Bar yAxisId="r" dataKey="revenue" name="إيرادات" fill="var(--color-teal)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {tab === "sources" && (
        <Table name="lead-sources" head={["المصدر", "العملاء", "اتواصل معاهم", "زيارات", "حجز أو أكتر", "بيع مؤكد", "التحويل", "لم يكتمل"]}
          rows={group(L, (l) => l.source).sort((a, b) => b[1].length - a[1].length).map(([s, ls]) => [
            LEAD_SOURCES[s] ?? s, ls.length, ls.filter((l) => REACHED(l.stage, "contacted")).length, ls.filter((l) => REACHED(l.stage, "visited")).length,
            ls.filter((l) => REACHED(l.stage, "reserved")).length, ls.filter((l) => l.stage === "sold").length, pct(ls.filter((l) => l.stage === "sold").length, ls.length), ls.filter((l) => l.stage === "lost").length,
          ])} />
      )}

      {tab === "companies" && scope.seeAll && (
        <Table name="company-performance" head={["الشركة", "العملاء", "متوسط وقت الرد", "رد في الوقت", "اتواصل معاهم", "بيع مؤكد", "التحويل", "قيمة المبيعات", "عمولات معتمدة", "اتحصّل", "متبقي"]}
          rows={group(L.filter((l) => l.assigned_broker_id), (l) => l.assigned_broker_id!).map(([id, ls]) => {
            const ds = view.sales.filter((x) => x.broker_id === id);
            const cs = view.comms.filter((c) => c.broker_id === id && !["expected", "pending_review", "cancelled"].includes(c.status));
            return [nameOf(id), ls.length, ...response(ls), ls.filter((l) => REACHED(l.stage, "contacted")).length, ls.filter((l) => l.stage === "sold").length, pct(ls.filter((l) => l.stage === "sold").length, ls.length),
              money(ds.reduce((s, x) => s + Number(x.sale_value ?? 0), 0)), money(cs.reduce((s, c) => s + Number(c.expected_amount ?? 0), 0)),
              money(cs.reduce((s, c) => s + Number(c.paid_amount), 0)), money(cs.reduce((s, c) => s + remaining(c), 0))];
          }).sort((a, b) => Number(b[1]) - Number(a[1]))} />
      )}

      {tab === "people" && (
        <Table name="employee-performance" head={["الموظف", "العملاء المسندين", "متوسط وقت الرد", "رد في الوقت", "قيد المتابعة", "متابعات متأخرة", "وصلوا لزيارة", "بيع مؤكد", "التحويل"]}
          rows={group(L.filter((l) => view.personOf(l)), (l) => view.personOf(l)).map(([id, ls]) => [
            nameOf(id, "عضو"), ls.length, ...response(ls), ls.filter((l) => !CLOSED_STAGES.includes(l.stage)).length,
            ls.filter((l) => l.follow_up_at && new Date(l.follow_up_at).getTime() < today && !CLOSED_STAGES.includes(l.stage)).length,
            ls.filter((l) => REACHED(l.stage, "visited")).length, ls.filter((l) => l.stage === "sold").length, pct(ls.filter((l) => l.stage === "sold").length, ls.length),
          ]).sort((a, b) => Number(b[1]) - Number(a[1]))} />
      )}

      {tab === "finance" && (
        <div className="space-y-4">
          <Table name="finance-by-company" head={["الشركة", "عمولات متوقعة", "معتمدة", "محصّلة", "متبقية", "متأخرة", "متنازع عليها"]}
            rows={[...new Set(view.comms.map((c) => c.broker_id ?? ""))].map((id) => {
              const cs = view.comms.filter((c) => (c.broker_id ?? "") === id && c.status !== "cancelled");
              const committed = cs.filter((c) => !["expected", "pending_review"].includes(c.status));
              return [nameOf(id), money(cs.filter((c) => ["expected", "pending_review"].includes(c.status)).reduce((s, c) => s + Number(c.expected_amount ?? 0), 0)),
                money(committed.reduce((s, c) => s + Number(c.expected_amount ?? 0), 0)), money(committed.reduce((s, c) => s + Number(c.paid_amount), 0)),
                money(committed.reduce((s, c) => s + remaining(c), 0)), money(cs.filter((c) => displayStatus(c) === "due").reduce((s, c) => s + remaining(c), 0)),
                cs.filter((c) => c.status === "disputed").length];
            })} />
          <Table name="monthly-finance" head={["الشهر", "قيمة المبيعات (عقارات)", "إيرادات فاليو عقار المحصّلة"]}
            rows={series.filter((s) => s.sales || s.revenue).map((s) => [s.m, money(s.sales), money(s.revenue)])} />
        </div>
      )}
    </div>
  );
}
