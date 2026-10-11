import { createFileRoute } from "@tanstack/react-router";
import { useMe } from "@/hooks/useAuth";
import { DashShell } from "@/components/dash/DashShell";
import { Reports } from "@/components/dash/Reports";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({ meta: [{ title: "التقارير | فاليو عقار" }, { name: "robots", content: "noindex" }] }),
  component: ReportsPage,
});

function ReportsPage() {
  const { me, loading } = useMe();
  const seeAll = !!me?.isAdmin || !!me?.isStaff;
  if (loading) return <DashShell title="التقارير"><div className="h-40 animate-pulse rounded-2xl bg-muted" /></DashShell>;
  if (!seeAll && !me?.broker) return <DashShell title="التقارير"><p className="max-w-lg rounded-2xl border bg-card p-6 text-sm text-muted-foreground">الصفحة دي للشركات والوسطاء وفريق فاليو عقار.</p></DashShell>;
  return (
    <DashShell title={seeAll ? "التقارير" : `تقارير ${me?.broker?.name ?? ""}`} isAdmin={!!me?.isAdmin}>
      <Reports scope={{ seeAll, isAdmin: !!me?.isAdmin, companyId: me?.broker?.id ?? null }} />
    </DashShell>
  );
}
