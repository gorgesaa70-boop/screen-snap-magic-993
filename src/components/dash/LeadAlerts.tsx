import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { dbx } from "@/lib/dbx";
import { leadNo, formatDate } from "@/components/site/data";

export const ALERT_KINDS: Record<string, { label: string; hint: string }> = {
  stale: { label: "عميل من غير متابعة", hint: "اتحال من أكتر من 7 أيام ومفيش أي نشاط عليه من أسبوع" },
  sudden_sale: { label: "بيع مفاجئ", hint: "بيع من غير زيارة أو حجز، أو بعد أقل من 3 أيام من الإحالة" },
  company_changed: { label: "تغيير الشركة بعد الإحالة", hint: "العميل مش مع أول شركة اتحال ليها" },
  bad_dates: { label: "تواريخ مش منطقية", hint: "حجز أو بيع قبل تسجيل العميل أو قبل إحالته" },
  dup_companies: { label: "نفس الرقم عند أكتر من شركة", hint: "العميل نفسه متسجل عند شركات مختلفة" },
  quick_lost: { label: "اتقفل بسرعة بعد الإحالة", hint: "«لم يكتمل» خلال 3 أيام — يستاهل مكالمة للعميل" },
};

/** Review report of suspicious lead patterns (admins and Value Aqar staff). */
export function LeadAlerts() {
  const q = useQuery({
    queryKey: ["lead-alerts"],
    queryFn: async () => {
      const { data, error } = await dbx.rpc("lead_alerts");
      if (error) throw error;
      return data ?? [];
    },
  });
  const [kind, setKind] = useState("");
  const rows = useMemo(() => (q.data ?? []).filter((a: any) => !kind || a.kind === kind).sort((a: any, b: any) => (b.happened_at ?? "").localeCompare(a.happened_at ?? "")), [q.data, kind]);
  const count = (k: string) => (q.data ?? []).filter((a: any) => a.kind === k).length;

  if (q.isLoading) return <div className="h-40 animate-pulse rounded-2xl bg-muted" />;
  if (q.error) return <p className="rounded-2xl border bg-card p-6 text-sm text-destructive">تعذّر تحميل التقرير.</p>;
  return (
    <div className="space-y-4">
      <p className="max-w-3xl text-sm text-muted-foreground">حالات تستاهل مراجعة لحماية عمولة فاليو عقار. التقرير بيتحدّث تلقائيًا من البيانات، ومفيش حاجة بتتغيّر لوحدها — راجع وقرّر.</p>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-6">
        {Object.entries(ALERT_KINDS).map(([k, v]) => (
          <button key={k} onClick={() => setKind(kind === k ? "" : k)} title={v.hint}
            className={`rounded-2xl border p-3 text-start transition ${kind === k ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:border-teal"}`}>
            <p className="text-2xl font-extrabold">{count(k)}</p>
            <p className="text-xs font-bold">{v.label}</p>
          </button>
        ))}
      </div>
      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">مفيش حالات {kind ? "من النوع ده" : ""} دلوقتي ✓</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border bg-card">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-secondary text-primary">
              <tr>{["التنبيه", "العميل", "الشركة", "التفاصيل", "التاريخ"].map((h) => <th key={h} className="p-3 text-start font-bold">{h}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((a: any, i: any) => (
                <tr key={`${a.kind}-${a.lead_id}-${i}`} className="border-t align-top">
                  <td className="p-3"><span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-bold text-destructive"><AlertTriangle className="size-3" />{ALERT_KINDS[a.kind]?.label ?? a.kind}</span></td>
                  <td className="p-3"><Link to="/leads/$id" params={{ id: a.lead_id }} className="font-bold text-primary hover:text-teal"><span dir="ltr">{leadNo(a.lead_no)}</span> · {a.lead_name}</Link></td>
                  <td className="p-3">{a.broker_name ?? "—"}</td>
                  <td className="p-3 text-foreground/80">{a.detail}</td>
                  <td className="p-3 text-muted-foreground">{a.happened_at ? formatDate(a.happened_at) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
