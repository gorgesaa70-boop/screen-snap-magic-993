import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { DashShell } from "@/components/dash/DashShell";
import { PhoneOtp } from "@/components/auth/PhoneOtp";
import { btnOutline } from "@/components/site/ui";

export const Route = createFileRoute("/_authenticated/account")({
  head: () => ({ meta: [{ title: "حسابي | فاليو عقار" }, { name: "robots", content: "noindex" }] }),
  component: AccountPage,
});

function AccountPage() {
  const { user } = Route.useRouteContext();
  const router = useRouter();
  const [changing, setChanging] = useState(false);
  return (
    <DashShell title="حسابي">
      <div className="max-w-md space-y-4 rounded-2xl border bg-card p-5 md:p-6">
        <div>
          <p className="text-sm font-bold text-muted-foreground">رقم الهاتف</p>
          <p className="mt-1 text-lg font-extrabold text-primary" dir="ltr">{user.phone ? `+${user.phone}` : "غير مضاف"}</p>
        </div>
        {user.email && <div><p className="text-sm font-bold text-muted-foreground">البريد</p><p className="mt-1 text-primary" dir="ltr">{user.email}</p></div>}
        {changing ? (
          <div className="border-t pt-4">
            <PhoneOtp mode="change" onVerified={() => { toast.success("تم تغيير رقم الهاتف"); setChanging(false); router.invalidate(); }} />
          </div>
        ) : (
          <button className={btnOutline} onClick={() => setChanging(true)}>{user.phone ? "تغيير رقم الهاتف" : "إضافة رقم هاتف"}</button>
        )}
      </div>
    </DashShell>
  );
}
