import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/useAuth";
import { DashShell } from "@/components/dash/DashShell";
import { LeadsBoard } from "@/components/dash/LeadsBoard";
import { NewLeadForm } from "@/components/dash/NewLeadForm";
import { LeadAlerts } from "@/components/dash/LeadAlerts";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/inquiries")({
  head: () => ({ meta: [{ title: "الطلبات والاستفسارات | فاليو عقار" }, { name: "robots", content: "noindex" }] }),
  component: InquiriesPage,
});

function InquiriesPage() {
  const { me, loading } = useMe();
  const isAdmin = !!me?.isAdmin;
  // Admins and Value Aqar staff see and assign every request.
  const seeAll = isAdmin || !!me?.isStaff;
  const [showAlerts, setShowAlerts] = useState(false);
  const brokerId = me?.broker?.id;

  const leads = useQuery({
    queryKey: ["inquiries", seeAll ? "all" : brokerId],
    enabled: seeAll || !!brokerId,
    queryFn: async () => {
      let q = supabase.from("leads").select("*, properties(title)").order("created_at", { ascending: false });
      if (!seeAll) q = q.eq("assigned_broker_id", brokerId!);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const brokers = useQuery({
    queryKey: ["inquiries-brokers"],
    enabled: seeAll,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_brokers");
      if (error) throw error;
      return data;
    },
  });

  if (loading) return <DashShell title="الطلبات والاستفسارات"><div className="h-40 animate-pulse rounded-2xl bg-muted" /></DashShell>;

  if (!seeAll && !brokerId) {
    return (
      <DashShell title="الطلبات والاستفسارات" isAdmin={isAdmin}>
        <p className="max-w-lg rounded-2xl border bg-card p-6 text-sm text-muted-foreground">
          هذه الصفحة متاحة للوسطاء والإدارة فقط. <Link to="/dashboard" className="font-bold text-primary underline">لوحتي</Link>
        </p>
      </DashShell>
    );
  }

  return (
    <DashShell title="الطلبات والاستفسارات" isAdmin={isAdmin}>
      {leads.isLoading ? (
        <div className="h-40 animate-pulse rounded-2xl bg-muted" />
      ) : leads.error ? (
        <p className="rounded-2xl border bg-card p-6 text-sm text-destructive">تعذّر تحميل الطلبات.</p>
      ) : (
        <div className="space-y-4">
        {seeAll && (
          <div className="flex flex-wrap gap-2">
            <NewLeadForm brokers={brokers.data ?? []} onDone={() => leads.refetch()} />
            <button onClick={() => setShowAlerts(!showAlerts)} className="inline-flex h-11 items-center rounded-xl border px-4 text-sm font-bold text-primary hover:bg-secondary">{showAlerts ? "إخفاء تنبيهات المراجعة" : "تنبيهات المراجعة"}</button>
          </div>
        )}
        {seeAll && showAlerts && <LeadAlerts />}
        <LeadsBoard
          list={leads.data ?? []}
          brokers={seeAll ? (brokers.data ?? []) : undefined}
          reload={() => leads.refetch()}
        />
        </div>
      )}
    </DashShell>
  );
}
