import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Clock, Shuffle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { formatWorkMinutes, workMinutes } from "@/lib/response-time";

export const useResponseSettings = () => useQuery({
  queryKey: ["response-settings"],
  queryFn: async () => (await supabase.from("app_settings").select("response_sla_minutes, work_start_hour, work_end_hour").eq("id", 1).maybeSingle()).data,
  staleTime: 10 * 60_000,
});

/** How the lead was assigned and how fast the company responded (working hours only). */
export function ResponseStatus({ lead, seeAll, assignSelectId }: { lead: Tables<"leads">; seeAll: boolean; assignSelectId: string }) {
  const settings = useResponseSettings();
  const rule = useQuery({
    queryKey: ["routing-rule-name", lead.routed_rule_id], enabled: seeAll && !!lead.routed_rule_id,
    queryFn: async () => (await supabase.from("routing_rules").select("name").eq("id", lead.routed_rule_id!).maybeSingle()).data?.name ?? null,
  });
  const sla = settings.data?.response_sla_minutes ?? 60;
  const hours = { start: settings.data?.work_start_hour ?? 9, end: settings.data?.work_end_hour ?? 21 };
  const waited = lead.referred_at ? workMinutes(lead.referred_at, lead.first_response_at ?? new Date(), hours) : 0;
  const late = waited > sla;

  return (
    <div className="mb-3 space-y-2 text-sm">
      {lead.routed_rule_id && (
        <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><Shuffle className="size-3.5 text-teal" />اتوزع تلقائي{rule.data ? ` بقاعدة: ${rule.data}` : ""}</p>
      )}
      {lead.assigned_broker_id && lead.referred_at && (lead.first_response_at ? (
        <p className={`flex items-center gap-1.5 text-xs font-bold ${late ? "text-destructive" : "text-teal"}`}>
          <CheckCircle2 className="size-4" />أول رد بعد {formatWorkMinutes(waited)} من ساعات العمل{late ? " (متأخر)" : ""}
        </p>
      ) : (
        <p className={`flex items-center gap-1.5 text-xs font-bold ${late ? "text-destructive" : "text-primary"}`}>
          <Clock className="size-4" />مستني رد من {formatWorkMinutes(waited)} من ساعات العمل{late ? ` — المدة المسموحة ${formatWorkMinutes(sla)}` : ""}
        </p>
      ))}
      {seeAll && lead.sla_escalated_at && !lead.first_response_at && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-3">
          <p className="flex items-center gap-1.5 font-bold text-destructive"><AlertTriangle className="size-4" />الشركة اتأخرت في الرد على العميل</p>
          <p className="mt-1 text-xs text-muted-foreground">لو عايز، أسند العميل لشركة تانية — الشركة الجديدة ليها نفس المدة عشان ترد.</p>
          <button type="button" onClick={() => { const el = document.getElementById(assignSelectId); el?.scrollIntoView({ behavior: "smooth", block: "center" }); el?.focus(); }}
            className="mt-2 inline-flex h-9 items-center rounded-lg bg-destructive px-3 text-xs font-bold text-primary-foreground">إعادة إسناد</button>
        </div>
      )}
    </div>
  );
}
