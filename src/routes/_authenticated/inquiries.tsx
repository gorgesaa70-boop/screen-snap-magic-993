import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/useAuth";
import { DashShell } from "@/components/dash/DashShell";
import { LeadsBoard } from "@/components/dash/LeadsBoard";

export const Route = createFileRoute("/_authenticated/inquiries")({
  head: () => ({ meta: [{ title: "الطلبات والاستفسارات | فاليو عقار" }, { name: "robots", content: "noindex" }] }),
  component: InquiriesPage,
});

function InquiriesPage() {
  const { me, loading } = useMe();
  const isAdmin = !!me?.isAdmin;
  const brokerId = me?.broker?.id;

  const leads = useQuery({
    queryKey: ["inquiries", isAdmin ? "admin" : brokerId],
    enabled: isAdmin || !!brokerId,
    queryFn: async () => {
      let q = supabase.from("leads").select("*, properties(title)").order("created_at", { ascending: false });
      if (!isAdmin) q = q.eq("assigned_broker_id", brokerId!);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const brokers = useQuery({
    queryKey: ["inquiries-brokers"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.from("brokers").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  if (loading) return <DashShell title="الطلبات والاستفسارات"><div className="h-40 animate-pulse rounded-2xl bg-muted" /></DashShell>;

  if (!isAdmin && !brokerId) {
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
        <LeadsBoard
          list={leads.data ?? []}
          brokers={isAdmin ? (brokers.data ?? []) : undefined}
          reload={() => leads.refetch()}
        />
      )}
    </DashShell>
  );
}
