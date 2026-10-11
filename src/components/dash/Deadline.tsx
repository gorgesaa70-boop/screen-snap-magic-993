import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Timer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_HOURS, formatWorkMinutes, workMinutes, type WorkHours } from "@/lib/response-time";

/** Working hours from app_settings (same ones the server uses for the deadline). */
export function useWorkHours(): WorkHours {
  const q = useQuery({
    queryKey: ["work-hours"], staleTime: 10 * 60_000,
    queryFn: async () => (await supabase.from("app_settings").select("work_start_hour, work_end_hour").eq("id", 1).maybeSingle()).data,
  });
  return q.data ? { start: q.data.work_start_hour, end: q.data.work_end_hour } : DEFAULT_HOURS;
}

/**
 * CRM: time left before an uncontacted lead moves to the next company. Display only — the server decides
 * (deadline stored on the lead, checked by the scheduled job).
 */
export function DeadlineBadge({ at, compact = false }: { at: string | null | undefined; compact?: boolean }) {
  const hours = useWorkHours();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(id); }, []);
  if (!at) return null;
  const left = new Date(at).getTime() > now ? workMinutes(now, at, hours) : 0;
  const urgent = left <= 15;
  const text = left > 0
    ? (compact ? formatWorkMinutes(left) : `فاضل ${formatWorkMinutes(left)} (شغل) قبل ما العميل يتنقل`)
    : (compact ? "خلصت" : "المهلة خلصت — هيتنقل لشركة تانية في التشغيل الجاي");
  return (
    <span title="سجّل نتيجة التواصل (رد واتكلمنا / طلب نكلمه تاني) عشان العميل يفضل معاك"
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${urgent ? "bg-destructive/10 text-destructive" : "bg-[#f2b84b]/20 text-primary"}`}>
      <Timer className="size-3.5 shrink-0" />{text}
    </span>
  );
}
