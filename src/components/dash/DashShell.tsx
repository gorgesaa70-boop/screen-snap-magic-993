import type { ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/site/Navbar";
import { logAuthEvent } from "@/components/auth/PhoneOtp";
import { NotificationBell } from "@/components/site/NotificationBell";
import { ThemeToggle } from "@/components/site/ThemeToggle";
import { can, hasAny } from "@/lib/permissions";
import { useMe } from "@/hooks/useAuth";

const linkCls = "shrink-0 rounded-lg px-3 py-2 text-foreground/75 hover:bg-secondary hover:text-primary";
const activeCls = { className: "text-primary bg-secondary" };

/** customer = signed-in customer (no broker, team, staff or admin role): only their own pages. */
export function DashShell({ title, children, isAdmin, customer }: { title: string; children: ReactNode; isAdmin?: boolean; customer?: boolean }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { me } = useMe();
  // An admin with no broker account has nothing on /dashboard (it sends them to /admin), so the link is hidden.
  const adminOnly = !!me?.isAdmin && !me.broker;
  // A Value Aqar employee (release 38) only gets the pages the admin granted.
  const staffOnly = !!me?.isStaff && !me.isAdmin && !me.broker;
  const show = (key: string) => !staffOnly || can(me?.perms, key);
  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await logAuthEvent("signed_out");
    // A shared device must stop getting this account's notifications.
    await import("@/lib/push-client").then((m) => m.disablePush()).catch(() => {});
    await supabase.auth.signOut();
    nav({ to: "/auth", replace: true });
  }
  return (
    <div className="min-h-screen bg-secondary/50">
      <header className="pt-safe sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 md:px-6">
          <div className="shrink-0"><Logo /></div>
          <nav className="flex min-w-0 items-center gap-1 text-sm font-bold">
            <div className="flex min-w-0 items-center gap-1 overflow-x-auto">
            {customer ? (
              <>
                <Link to="/dashboard" className={linkCls} activeProps={activeCls}>صفحتي</Link>
                <Link to="/favorites" className={linkCls} activeProps={activeCls}>المفضلة</Link>
                <Link to="/my-requests" className={linkCls} activeProps={activeCls}>طلباتي</Link>
                <Link to="/my-listings" className={linkCls} activeProps={activeCls}>إعلاناتي</Link>
                <Link to="/messages" className={linkCls} activeProps={activeCls}>الرسايل</Link>
                <Link to="/account" className={linkCls} activeProps={activeCls}>حسابي</Link>
                <a href="/" className={linkCls}>تصفّح العقارات</a>
              </>
            ) : (<>
            {!adminOnly && <Link to="/dashboard" className="shrink-0 rounded-lg px-3 py-2 text-foreground/75 hover:bg-secondary hover:text-primary" activeProps={{ className: "text-primary bg-secondary" }}>لوحتي</Link>}
            {!!me?.isStaff && !me.isAdmin && hasAny(me?.perms) && <Link to="/admin" className="shrink-0 rounded-lg px-3 py-2 text-foreground/75 hover:bg-secondary hover:text-primary" activeProps={{ className: "text-primary bg-secondary" }}>لوحة العمل</Link>}
            {isAdmin && <Link to="/admin" className="shrink-0 rounded-lg px-3 py-2 text-foreground/75 hover:bg-secondary hover:text-primary" activeProps={{ className: "text-primary bg-secondary" }}>الإدارة</Link>}
            {show("tasks") && <Link to="/tasks" className="shrink-0 rounded-lg px-3 py-2 text-foreground/75 hover:bg-secondary hover:text-primary" activeProps={{ className: "text-primary bg-secondary" }}>متابعاتي</Link>}
            {show("leads") && <Link to="/inquiries" className="shrink-0 rounded-lg px-3 py-2 text-foreground/75 hover:bg-secondary hover:text-primary" activeProps={{ className: "text-primary bg-secondary" }}>العملاء والطلبات</Link>}
            {show("messages") && <Link to="/messages" className="shrink-0 rounded-lg px-3 py-2 text-foreground/75 hover:bg-secondary hover:text-primary" activeProps={{ className: "text-primary bg-secondary" }}>الرسايل</Link>}
            {show("reports") && <Link to="/reports" className="shrink-0 rounded-lg px-3 py-2 text-foreground/75 hover:bg-secondary hover:text-primary" activeProps={{ className: "text-primary bg-secondary" }}>التقارير</Link>}
            {show("deals") && <Link to="/deals" className="shrink-0 rounded-lg px-3 py-2 text-foreground/75 hover:bg-secondary hover:text-primary" activeProps={{ className: "text-primary bg-secondary" }}>الصفقات</Link>}
            {show("commissions") && <Link to="/commissions" className="shrink-0 rounded-lg px-3 py-2 text-foreground/75 hover:bg-secondary hover:text-primary" activeProps={{ className: "text-primary bg-secondary" }}>العمولات</Link>}
            <Link to="/account" className="shrink-0 rounded-lg px-3 py-2 text-foreground/75 hover:bg-secondary hover:text-primary" activeProps={{ className: "text-primary bg-secondary" }}>حسابي</Link>
            </>)}
            </div>
            <ThemeToggle />
            <NotificationBell />
            <button onClick={signOut} aria-label="تسجيل الخروج" className="grid size-10 place-items-center rounded-full text-primary hover:bg-secondary"><LogOut className="size-5" /></button>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-8">
        <h1 className="mb-5 text-2xl font-extrabold text-primary md:text-3xl">{title}</h1>
        {children}
      </main>
    </div>
  );
}
