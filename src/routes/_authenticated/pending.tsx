import { createFileRoute, Link } from "@tanstack/react-router";
import { Clock } from "lucide-react";
import { DashShell } from "@/components/dash/DashShell";
import { useMe } from "@/hooks/useAuth";
import { btnPrimary } from "@/components/site/ui";

export const Route = createFileRoute("/_authenticated/pending")({
  head: () => ({ meta: [{ title: "حسابك قيد المراجعة | فاليو عقار" }, { name: "robots", content: "noindex" }] }),
  component: PendingPage,
});

function PendingPage() {
  const { me } = useMe();
  // An approved account landing here from an old link gets a way into its dashboard.
  const active = !!me?.broker?.is_active;
  return (
    <DashShell title={active ? "حسابك متفعّل" : "حسابك قيد المراجعة"}>
      <div className="max-w-lg rounded-2xl border bg-card p-6 text-center">
        <Clock className="mx-auto size-12 text-teal" />
        {active ? (
          <>
            <p className="mt-4 font-bold text-primary">حسابك اتراجع واتفعّل ✓</p>
            <Link to="/dashboard" className={`${btnPrimary} mt-5`}>ادخل لوحتك</Link>
          </>
        ) : (
          <>
            <p className="mt-4 font-bold text-primary">تم استلام طلب انضمامك</p>
            <p className="mt-2 text-sm text-muted-foreground">تراجع إدارة فاليو عقار بياناتك الآن، وستتمكن من الوصول إلى لوحة الوسيط فور اعتماد حسابك.</p>
          </>
        )}
      </div>
    </DashShell>
  );
}
