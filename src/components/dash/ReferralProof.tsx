import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { LEAD_SOURCES } from "@/components/site/data";

type Lead = Tables<"leads">;
const when = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" }) : "—");
const day = (d: string | null | undefined) => (d ? new Date(d).toLocaleDateString("ar-EG", { dateStyle: "medium" }) : "—");

/**
 * Evidence that the customer came through Value Aqar: original source, first referral (fixed),
 * assignment history and the order of dates up to the sale. Admins and staff only.
 */
export function ReferralProof({ lead, brokerNames }: { lead: Lead; brokerNames: Map<string, string> }) {
  const q = useQuery({
    queryKey: ["referral-proof", lead.id],
    queryFn: async () => {
      const [h, d] = await Promise.all([
        dbx.from("lead_assignments").select("*").eq("lead_id", lead.id).order("created_at"),
        dbx.from("deals").select("reservation_date, contract_date, sale_date").eq("lead_id", lead.id).maybeSingle(),
      ]);
      return { history: h.data ?? [], deal: d.data };
    },
  });
  const name = (id: string | null) => (id ? brokerNames.get(id) ?? "شركة" : "بدون");
  const deal = q.data?.deal;
  const ref = lead.first_referred_at ? lead.first_referred_at.slice(0, 10) : null;
  const created = lead.created_at.slice(0, 10);
  const checks: [string, boolean][] = [];
  if (deal?.reservation_date) checks.push(["الحجز بعد تسجيل العميل وبعد الإحالة", deal.reservation_date >= created && (!ref || deal.reservation_date >= ref)]);
  if (deal?.sale_date) checks.push(["البيع بعد تسجيل العميل وبعد الإحالة", deal.sale_date >= created && (!ref || deal.sale_date >= ref)]);
  if (lead.first_broker_id) checks.push(["العميل لسه مع أول شركة اتحال ليها", lead.first_broker_id === lead.assigned_broker_id]);

  return (
    <div className="space-y-3 text-sm">
      <ol className="space-y-1.5 border-s-2 border-teal/40 ps-3">
        <li><span className="text-muted-foreground">اتسجل على المنصة: </span><span className="font-semibold">{when(lead.created_at)}</span> <span className="text-xs text-muted-foreground">({LEAD_SOURCES[lead.original_source] ?? lead.original_source})</span></li>
        <li><span className="text-muted-foreground">أول إحالة: </span><span className="font-semibold">{name(lead.first_broker_id)} — {when(lead.first_referred_at)}</span> <span className="text-xs text-muted-foreground">(ثابتة)</span></li>
        {lead.assigned_broker_id !== lead.first_broker_id && <li><span className="text-muted-foreground">مع الشركة الحالية من: </span><span className="font-semibold">{name(lead.assigned_broker_id)} — {when(lead.referred_at)}</span></li>}
        {deal?.reservation_date && <li><span className="text-muted-foreground">الحجز: </span><span className="font-semibold">{day(deal.reservation_date)}</span></li>}
        {deal?.contract_date && <li><span className="text-muted-foreground">العقد: </span><span className="font-semibold">{day(deal.contract_date)}</span></li>}
        {deal?.sale_date && <li><span className="text-muted-foreground">البيع: </span><span className="font-semibold">{day(deal.sale_date)}</span></li>}
      </ol>
      {checks.length > 0 && (
        <ul className="space-y-1">
          {checks.map(([label, ok]) => (
            <li key={label} className={`flex items-center gap-1.5 text-xs font-bold ${ok ? "text-teal" : "text-destructive"}`}>
              {ok ? <CheckCircle2 className="size-4" /> : <AlertTriangle className="size-4" />}{label}
            </li>
          ))}
        </ul>
      )}
      <details>
        <summary className="cursor-pointer text-xs font-bold text-primary">سجل الإسناد ({q.data?.history.length ?? 0})</summary>
        <ul className="mt-2 space-y-1 text-xs text-foreground/80">
          {q.data?.history.map((h) => (
            <li key={h.id}>{when(h.created_at)} — {name(h.broker_id)}{h.member_id ? " · عضو فريق" : ""}{h.staff_id ? " · موظف فاليو عقار" : ""}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}
