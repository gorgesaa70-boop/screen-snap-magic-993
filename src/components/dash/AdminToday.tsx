import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { formatPrice } from "@/components/site/data";

type Card = { tab: string; label: string; hint: string; count: number };

/** One head request per count: nothing but the number travels. */
function useHeadCount(key: string, enabled: boolean, run: () => PromiseLike<{ count: number | null }>) {
  return useQuery({ queryKey: ["admin-data", "count", key], enabled, queryFn: async () => (await run()).count ?? 0 });
}

/**
 * «المطلوب النهارده»: the admin panel's landing page — what is waiting on the team, each card opening its section.
 * Only sections this person may open are counted (staff permissions, release 38).
 */
export function AdminToday({ visible, go, isAdmin, pending, pendingPlaces, pendingAccounts }: {
  visible: (tab: never) => boolean;
  go: (tab: never) => void;
  isAdmin: boolean;
  pending: number;
  pendingPlaces: number;
  pendingAccounts: number;
}) {
  const can = visible as (tab: string) => boolean;
  const open = go as (tab: string) => void;
  const leads = useHeadCount("leads-unassigned", can("leads"), () => supabase.from("leads").select("id", { count: "exact", head: true }).is("assigned_broker_id", null).not("stage", "in", "(lost,sold)"));
  const wa = useHeadCount("wa-unread", can("wa_inbox"), () => supabase.from("wa_conversations").select("phone", { count: "exact", head: true }).gt("unread", 0));
  const reports = useHeadCount("reports-open", can("content_reports"), () => supabase.from("content_reports").select("id", { count: "exact", head: true }).eq("status", "open"));
  const svc = useHeadCount("svc-new", can("svc_requests"), () => supabase.from("service_requests").select("id", { count: "exact", head: true }).eq("status", "new"));
  const deals = useHeadCount("deals-pending", isAdmin, () => supabase.from("deals").select("id", { count: "exact", head: true }).eq("review_status", "pending"));
  const cards: Card[] = [
    { tab: "review", label: "عقارات مستنية المراجعة", hint: "اعتماد أو رفض", count: pending },
    { tab: "brokers", label: "حسابات جديدة", hint: "طلبات انضمام", count: pendingAccounts },
    { tab: "locations", label: "مناطق جديدة", hint: "أضافها الوسطاء", count: pendingPlaces },
    { tab: "leads", label: "عملاء مش متوزّعين", hint: "محتاجين يتحوّلوا لشركة", count: leads.data ?? 0 },
    { tab: "wa_inbox", label: "محادثات واتساب مش مقروءة", hint: "عملاء مستنيين رد", count: wa.data ?? 0 },
    { tab: "content_reports", label: "بلاغات مفتوحة", hint: "عن إعلانات أو صفحات", count: reports.data ?? 0 },
    { tab: "svc_requests", label: "طلبات خدمات جديدة", hint: "محتاجة تتحوّل لمقدم خدمة", count: svc.data ?? 0 },
  ].filter((c) => can(c.tab));
  const waiting = cards.filter((c) => c.count > 0);
  return (
    <div className="space-y-4">
      {waiting.length === 0 && (deals.data ?? 0) === 0 && <p className="rounded-2xl border border-dashed bg-card p-6 text-center text-sm font-bold text-teal">✓ مفيش حاجة مستنياك دلوقتي.</p>}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {cards.map((c) => (
          <button key={c.tab} type="button" onClick={() => open(c.tab)}
            className={`rounded-2xl border p-4 text-start transition hover:border-teal md:p-5 ${c.count > 0 ? "border-teal bg-teal-soft/50" : "bg-card"}`}>
            <p className="text-xs font-bold text-muted-foreground md:text-sm">{c.label}</p>
            <p className={`mt-1.5 text-2xl font-extrabold md:text-3xl ${c.count > 0 ? "text-primary" : "text-muted-foreground"}`}>{formatPrice(c.count)}</p>
            <p className="mt-1 text-xs text-muted-foreground">{c.hint} ←</p>
          </button>
        ))}
        {isAdmin && (
          <Link to="/deals" className={`rounded-2xl border p-4 text-start transition hover:border-teal md:p-5 ${(deals.data ?? 0) > 0 ? "border-teal bg-teal-soft/50" : "bg-card"}`}>
            <p className="text-xs font-bold text-muted-foreground md:text-sm">صفقات مستنية اعتماد</p>
            <p className={`mt-1.5 text-2xl font-extrabold md:text-3xl ${(deals.data ?? 0) > 0 ? "text-primary" : "text-muted-foreground"}`}>{formatPrice(deals.data ?? 0)}</p>
            <p className="mt-1 text-xs text-muted-foreground">بيع أو حجز من الشركات ←</p>
          </Link>
        )}
      </div>
    </div>
  );
}
