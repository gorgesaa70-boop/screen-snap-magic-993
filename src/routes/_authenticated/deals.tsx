import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Download, Search } from "lucide-react";
import { dbx } from "@/lib/dbx";
import { useMe } from "@/hooks/useAuth";
import { DashShell } from "@/components/dash/DashShell";
import { DEAL_STATUS, dealNo } from "@/components/dash/LeadPipeline";
import { Stat, inputCls, btnOutline } from "@/components/site/ui";
import { formatPrice, leadNo } from "@/components/site/data";
import type { DealRow } from "@/lib/finance";

export const Route = createFileRoute("/_authenticated/deals")({
  head: () => ({ meta: [{ title: "الصفقات | فاليو عقار" }, { name: "robots", content: "noindex" }] }),
  component: DealsPage,
});

type Row = DealRow & { leads: { name: string; lead_no: number } | null; brokers: { name: string } | null };
const day = (d: string | null) => (d ? new Date(d).toLocaleDateString("ar-EG", { dateStyle: "medium" }) : "—");
const value = (d: DealRow) => d.sale_value ?? d.contract_value ?? d.reservation_amount;
const step = (d: DealRow) => (d.sale_date ? "بيع" : d.contract_date ? "عقد" : d.reservation_date ? "حجز" : "مفتوحة");

function exportCsv(rows: Row[]) {
  const esc = (v: unknown) => { const t = v == null ? "" : String(v); return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  const head = ["رقم الصفقة", "رقم العميل", "العميل", "الشركة", "الوحدة", "تاريخ الحجز", "مبلغ الحجز", "تاريخ العقد", "قيمة العقد", "تاريخ البيع", "قيمة البيع", "حالة المراجعة", "سبب الرفض / الملاحظة"];
  const lines = rows.map((d) => [dealNo(d.deal_no), leadNo(d.leads?.lead_no), d.leads?.name, d.brokers?.name, d.unit_desc, d.reservation_date, d.reservation_amount, d.contract_date, d.contract_value, d.sale_date, d.sale_value, DEAL_STATUS[d.review_status]?.label, d.review_note].map(esc).join(","));
  const blob = new Blob(["﻿" + [head.join(","), ...lines].join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `deals-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(a.href);
}

function DealsPage() {
  const { me, loading } = useMe();
  const seeAll = !!me?.isAdmin || !!me?.isStaff;
  const allowed = seeAll || !!me?.broker;
  const q = useQuery({
    queryKey: ["deals-center"], enabled: allowed,
    queryFn: async () => {
      const { data, error } = await dbx.from("deals").select("*, leads(name, lead_no), brokers(name)").order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });
  const [status, setStatus] = useState("");
  const [company, setCompany] = useState("");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const all = q.data ?? [];
  const companies = useMemo(() => [...new Map(all.filter((d) => d.broker_id).map((d) => [d.broker_id!, d.brokers?.name ?? "—"])).entries()], [all]);
  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    const no = Number(s.replace(/^(d|va)-?/i, "").replace(/^0+/, ""));
    return all.filter((d) => {
      const date = (d.sale_date ?? d.contract_date ?? d.reservation_date ?? d.created_at).slice(0, 10);
      return (!status || d.review_status === status) && (!company || d.broker_id === company)
        && (!from || date >= from) && (!to || date <= to)
        && (!s || (d.leads?.name ?? "").toLowerCase().includes(s) || (!!no && (d.deal_no === no || d.leads?.lead_no === no)) || (d.unit_desc ?? "").toLowerCase().includes(s));
    });
  }, [all, status, company, search, from, to]);
  const approved = rows.filter((d) => d.review_status === "approved");

  if (loading) return <DashShell title="الصفقات"><div className="h-40 animate-pulse rounded-2xl bg-muted" /></DashShell>;
  if (!allowed) return <DashShell title="الصفقات"><p className="max-w-lg rounded-2xl border bg-card p-6 text-sm text-muted-foreground">الصفحة دي للشركات والوسطاء والإدارة.</p></DashShell>;
  return (
    <DashShell title="الصفقات" isAdmin={!!me?.isAdmin}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Stat label="كل الصفقات" value={rows.length} />
          <Stat label="بانتظار المراجعة" value={rows.filter((d) => d.review_status === "pending").length} />
          <Stat label="مبيعات معتمدة" value={approved.length} />
          <Stat label="قيمة المبيعات المعتمدة" value={`${formatPrice(approved.reduce((s, d) => s + Number(d.sale_value ?? 0), 0))} ج.م`} hint="قيمة العقارات، مش إيراد فاليو عقار" />
          <Stat label="حجوزات وعقود مفتوحة" value={rows.filter((d) => d.review_status !== "approved" && (d.reservation_date || d.contract_date)).length} />
        </div>

        <div className="flex flex-col gap-2 lg:flex-row lg:flex-wrap">
          <div className="relative flex-1 lg:min-w-56">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input aria-label="بحث" className={`${inputCls} ps-9`} placeholder="اسم العميل أو رقم الصفقة / العميل أو الوحدة" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select aria-label="حالة المراجعة" className={`${inputCls} lg:w-48`} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">كل الحالات</option>{Object.entries(DEAL_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          {seeAll && (
            <select aria-label="الشركة" className={`${inputCls} lg:w-48`} value={company} onChange={(e) => setCompany(e.target.value)}>
              <option value="">كل الشركات</option>{companies.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
            </select>
          )}
          <label className="flex items-center gap-1 text-xs font-bold text-muted-foreground">من<input type="date" className={`${inputCls} w-auto`} value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="flex items-center gap-1 text-xs font-bold text-muted-foreground">إلى<input type="date" className={`${inputCls} w-auto`} value={to} onChange={(e) => setTo(e.target.value)} /></label>
          <button className={btnOutline} disabled={!rows.length} onClick={() => exportCsv(rows)}><Download className="size-4" />تصدير CSV</button>
        </div>

        {q.isLoading ? <div className="h-40 animate-pulse rounded-2xl bg-muted" /> : q.error ? (
          <p className="rounded-2xl border bg-card p-6 text-sm text-destructive">تعذّر تحميل الصفقات.</p>
        ) : rows.length === 0 ? (
          <p className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">مفيش صفقات {all.length ? "مطابقة للفلاتر" : "لسه"}. الصفقة بتتفتح من صفحة العميل لما يوصل للحجز.</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border bg-card">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-secondary text-primary">
                <tr>{["الصفقة", "العميل", "الشركة", "الوحدة", "المرحلة", "التاريخ", "القيمة", "المراجعة"].map((h) => <th key={h} className="p-3 text-start font-bold">{h}</th>)}</tr>
              </thead>
              <tbody>
                {rows.map((d) => (
                  <tr key={d.id} className="border-t align-top hover:bg-secondary/40">
                    <td className="p-3"><Link to="/leads/$id" params={{ id: d.lead_id }} className="font-bold text-primary hover:text-teal" dir="ltr">{dealNo(d.deal_no)}</Link></td>
                    <td className="p-3"><Link to="/leads/$id" params={{ id: d.lead_id }} className="font-bold text-primary hover:text-teal">{d.leads?.name ?? "—"}</Link><span className="block text-xs text-muted-foreground" dir="ltr">{leadNo(d.leads?.lead_no)}</span></td>
                    <td className="p-3">{d.brokers?.name ?? "—"}</td>
                    <td className="p-3 text-foreground/80">{d.unit_desc ?? "—"}</td>
                    <td className="p-3">{step(d)}</td>
                    <td className="p-3 text-muted-foreground">{day(d.sale_date ?? d.contract_date ?? d.reservation_date)}</td>
                    <td className="p-3 font-bold text-primary">{value(d) != null ? `${formatPrice(Number(value(d)))} ج.م` : "—"}</td>
                    <td className="p-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${DEAL_STATUS[d.review_status]?.cls}`}>{DEAL_STATUS[d.review_status]?.label}</span>
                      {d.review_note && d.review_status !== "approved" && <span className="mt-1 block max-w-48 text-xs text-destructive">{d.review_note}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </DashShell>
  );
}
