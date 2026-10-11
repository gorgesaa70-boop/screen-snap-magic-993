import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { dbx } from "@/lib/dbx";
import { inputCls, btnOutline } from "@/components/site/ui";

const TABLES: Record<string, string> = {
  brokers: "الحسابات", user_roles: "الصلاحيات", company_members: "فرق الشركات", leads: "العملاء", deals: "الصفقات",
  deal_documents: "مستندات الصفقات", commissions: "العمولات", commission_payments: "دفعات العمولات", company_agreements: "اتفاقيات العمولة",
  app_settings: "إعدادات التطبيق", plans: "الباقات", subscriptions: "الاشتراكات", properties: "العقارات", projects: "المشروعات",
};
const ACTIONS: Record<string, string> = { insert: "إضافة", update: "تعديل", delete: "حذف" };
const PAGE = 100;

type Entry = { id: number; at: string; actor_label: string | null; table_name: string; row_id: string | null; action: string; changes: Record<string, unknown> };

const show = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v));

/** Admin-only, read-only view of every sensitive change (who, when, what changed). */
export function AuditLog() {
  const [table, setTable] = useState("");
  const [action, setAction] = useState("");
  const [from, setFrom] = useState("");
  const [rowId, setRowId] = useState("");
  const q = useInfiniteQuery({
    queryKey: ["audit-log", table, action, from, rowId],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      let req = dbx.from("audit_log").select("*").order("id", { ascending: false }).range(pageParam, pageParam + PAGE - 1);
      if (table) req = req.eq("table_name", table);
      if (action) req = req.eq("action", action);
      if (from) req = req.gte("at", from);
      if (rowId.trim()) req = req.eq("row_id", rowId.trim());
      const { data, error } = await req;
      if (error) throw error;
      return (data ?? []) as Entry[];
    },
    getNextPageParam: (last, pages) => (last.length === PAGE ? pages.length * PAGE : undefined),
  });
  const rows = q.data?.pages.flat() ?? [];

  return (
    <div className="space-y-3">
      <p className="max-w-3xl text-sm text-muted-foreground">كل تعديل حساس بيتسجل هنا لوحده: مين، إمتى، وإيه اللي اتغيّر (القيمة القديمة ← الجديدة). السجل ده مابيتعدّلش ولا بيتمسح.</p>
      <div className="flex flex-wrap gap-2">
        <select aria-label="الجزء" className={`${inputCls} w-auto`} value={table} onChange={(e) => setTable(e.target.value)}>
          <option value="">كل الأجزاء</option>{Object.entries(TABLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select aria-label="العملية" className={`${inputCls} w-auto`} value={action} onChange={(e) => setAction(e.target.value)}>
          <option value="">كل العمليات</option>{Object.entries(ACTIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <label className="flex items-center gap-1 text-xs font-bold text-muted-foreground">من<input type="date" className={`${inputCls} w-auto`} value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <input aria-label="رقم السجل" className={`${inputCls} w-72`} dir="ltr" placeholder="ID السجل (اختياري)" value={rowId} onChange={(e) => setRowId(e.target.value)} />
      </div>
      {q.isLoading ? <div className="h-40 animate-pulse rounded-2xl bg-muted" /> : q.error ? (
        <p className="rounded-2xl border bg-card p-6 text-sm text-destructive">تعذّر تحميل السجل.</p>
      ) : rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">مفيش حاجة متسجلة بالفلاتر دي.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <details key={r.id} className="rounded-xl border bg-card p-3 text-sm">
              <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-xs text-muted-foreground">{new Date(r.at).toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "short" })}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${r.action === "delete" ? "bg-destructive/10 text-destructive" : r.action === "insert" ? "bg-teal-soft text-primary" : "bg-secondary text-primary"}`}>{ACTIONS[r.action] ?? r.action}</span>
                <span className="font-bold text-primary">{TABLES[r.table_name] ?? r.table_name}</span>
                <span className="text-foreground/80">{r.actor_label ?? "—"}</span>
                {r.action === "update" && <span className="text-xs text-muted-foreground">{Object.keys(r.changes).join("، ")}</span>}
              </summary>
              <div className="mt-2 space-y-1 border-t pt-2 text-xs" dir="ltr">
                <p className="text-muted-foreground">{r.table_name} / {r.row_id}</p>
                {r.action === "update"
                  ? Object.entries(r.changes).map(([k, v]) => {
                      const [o, n] = Array.isArray(v) ? v : [undefined, v];
                      return <p key={k}><b>{k}</b>: <span className="text-destructive line-through">{show(o)}</span> → <span className="font-semibold text-primary">{show(n)}</span></p>;
                    })
                  : <pre className="whitespace-pre-wrap break-all text-foreground/80">{JSON.stringify(r.changes, null, 1)}</pre>}
              </div>
            </details>
          ))}
          {q.hasNextPage && <button disabled={q.isFetchingNextPage} onClick={() => q.fetchNextPage()} className={btnOutline}>{q.isFetchingNextPage ? "..." : "عرض أقدم"}</button>}
        </div>
      )}
    </div>
  );
}
