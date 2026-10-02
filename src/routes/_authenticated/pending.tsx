import { createFileRoute } from "@tanstack/react-router";
import { Clock } from "lucide-react";
import { DashShell } from "@/components/dash/DashShell";

export const Route = createFileRoute("/_authenticated/pending")({
  head: () => ({ meta: [{ title: "حسابك قيد المراجعة | فاليو عقار" }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <DashShell title="حسابك قيد المراجعة">
      <div className="max-w-lg rounded-2xl border bg-card p-6 text-center">
        <Clock className="mx-auto size-12 text-teal" />
        <p className="mt-4 font-bold text-primary">تم استلام طلب انضمامك</p>
        <p className="mt-2 text-sm text-muted-foreground">تراجع إدارة فاليو عقار بياناتك الآن، وستتمكن من الوصول إلى لوحة الوسيط فور اعتماد حسابك.</p>
      </div>
    </DashShell>
  ),
});
