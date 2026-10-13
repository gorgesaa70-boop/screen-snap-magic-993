import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { DashShell } from "@/components/dash/DashShell";
import { PhoneOtp } from "@/components/auth/PhoneOtp";
import { btnOutline, inputCls } from "@/components/site/ui";
import { useMe } from "@/hooks/useAuth";
import { deleteMyAccount } from "@/lib/account.functions";

export const Route = createFileRoute("/_authenticated/account")({
  head: () => ({ meta: [{ title: "حسابي | فاليو عقار" }, { name: "robots", content: "noindex" }] }),
  component: AccountPage,
});

function AccountPage() {
  const { user } = Route.useRouteContext();
  const router = useRouter();
  const { me } = useMe();
  const [changing, setChanging] = useState(false);
  const customer = !!me && !me.broker && !me.isAdmin && !me.isStaff;
  return (
    <DashShell title="حسابي" isAdmin={!!me?.isAdmin} customer={customer}>
      <div className="max-w-md space-y-4">
        <div className="space-y-4 rounded-2xl border bg-card p-5 md:p-6">
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
        <DeleteAccount isAdmin={!!me?.isAdmin} hasBusiness={!!me?.broker} />
        <p className="text-xs text-muted-foreground">
          <Link to="/privacy" className="font-bold text-primary hover:text-teal">سياسة الخصوصية</Link> · <Link to="/terms" className="font-bold text-primary hover:text-teal">شروط الاستخدام</Link>
        </p>
      </div>
    </DashShell>
  );
}

/** In-app account deletion, required by the App Store and Google Play. */
function DeleteAccount({ isAdmin, hasBusiness }: { isAdmin: boolean; hasBusiness: boolean }) {
  const remove = useServerFn(deleteMyAccount);
  const nav = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [word, setWord] = useState("");
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    const r = await remove({ data: { confirm: "امسح" } }).catch(() => ({ ok: false as const, error: "server" }));
    setBusy(false);
    if (!r.ok) { toast.error(r.error === "admin" ? "ده حساب مدير — لازم مدير تاني يشيل صلاحيتك الأول" : "ماتمسحش، جرّب تاني أو كلّمنا"); return; }
    qc.clear();
    await import("@/lib/push-client").then((m) => m.disablePush()).catch(() => {});
    await supabase.auth.signOut();
    toast.success("حسابك اتمسح. شكرًا إنك جربت فاليو عقار");
    nav({ to: "/", replace: true });
  }
  return (
    <div className="rounded-2xl border border-destructive/30 bg-card p-5 md:p-6">
      <p className="font-bold text-destructive">مسح الحساب</p>
      <p className="mt-1 text-sm text-muted-foreground">
        هنمسح حسابك وبياناتك الشخصية (المفضلة، التنبيهات، الإشعارات){hasBusiness ? "، وملفك وعقاراتك هيختفوا من الموقع" : ""}. الطلبات اللي بعتها قبل كده بتفضل عند الشركة من غير ربط بحسابك. المسح نهائي.
      </p>
      {isAdmin ? (
        <p className="mt-3 text-sm font-bold text-primary">ده حساب مدير؛ لازم مدير تاني يشيل صلاحيتك الأول.</p>
      ) : !open ? (
        <button onClick={() => setOpen(true)} className="mt-3 inline-flex h-11 items-center gap-1.5 rounded-xl px-4 text-sm font-bold text-destructive hover:bg-destructive/10"><Trash2 className="size-4" />امسح حسابي</button>
      ) : (
        <div className="mt-3 space-y-2">
          <label className="block text-sm font-bold text-primary">اكتب كلمة «امسح» للتأكيد
            <input className={`${inputCls} mt-1`} value={word} onChange={(e) => setWord(e.target.value)} autoComplete="off" />
          </label>
          <div className="flex gap-2">
            <button disabled={busy || word.trim() !== "امسح"} onClick={go} className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-destructive px-4 text-sm font-bold text-white disabled:opacity-50"><Trash2 className="size-4" />{busy ? "..." : "مسح نهائي"}</button>
            <button onClick={() => { setOpen(false); setWord(""); }} className="h-11 px-4 text-sm font-bold text-muted-foreground hover:text-primary">رجوع</button>
          </div>
        </div>
      )}
    </div>
  );
}
