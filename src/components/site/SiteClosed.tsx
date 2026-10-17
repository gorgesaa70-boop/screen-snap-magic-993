import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { MessageCircle, Lock } from "lucide-react";
import { dbx } from "@/lib/dbx";
import { useMe } from "@/hooks/useAuth";
import { Logo } from "@/components/site/Navbar";
import { WHATSAPP_NUMBER, waLink } from "@/components/site/data";

export type SiteClosedState = { closed: boolean; message: string };

export async function fetchSiteClosed(): Promise<SiteClosedState> {
  const { data, error } = await dbx.from("app_settings").select("site_closed, site_closed_message").eq("id", 1).maybeSingle();
  // Before release 32 the columns don't exist: the site stays open.
  if (error || !data) return { closed: false, message: "" };
  return { closed: !!data.site_closed, message: data.site_closed_message ?? "" };
}
export const useSiteClosed = () => useQuery({ queryKey: ["site-closed"], queryFn: fetchSiteClosed, staleTime: 60_000 });

/** Pages that stay open while the site is closed, so the admin and staff can still sign in. */
const OPEN_PATHS = ["/auth", "/reset-password"];

/**
 * When the admin closes the site, visitors get one full-screen «تم غلق الموقع» page instead of any page.
 * Admins and Value Aqar staff see the site as usual, with a thin bar reminding them it is closed.
 */
export function SiteClosedGate({ children }: { children: ReactNode }) {
  const q = useSiteClosed();
  const { me, loading } = useMe();
  const path = useRouterState({ select: (s) => s.location.pathname });
  if (!q.data?.closed || OPEN_PATHS.some((p) => path.startsWith(p))) return <>{children}</>;
  if (loading) return null;
  if (me?.isAdmin || me?.isStaff) {
    return (
      <>
        <div className="sticky top-0 z-[60] bg-destructive px-4 py-1.5 text-center text-xs font-bold text-destructive-foreground">
          الموقع مقفول للزوار دلوقتي — بتشوفه إنت بس لأنك من فريق فاليو عقار. افتحه من الإعدادات ← غلق الموقع.
        </div>
        {children}
      </>
    );
  }
  return <SiteClosedPage message={q.data.message} />;
}

export function SiteClosedPage({ message }: { message: string }) {
  return (
    <main className="grid min-h-screen place-items-center bg-secondary px-4 py-10">
      <div className="w-full max-w-md rounded-3xl border bg-card p-8 text-center shadow-card">
        <div className="flex justify-center"><Logo /></div>
        <span className="mx-auto mt-6 grid size-16 place-items-center rounded-full bg-primary/10"><Lock className="size-8 text-primary" /></span>
        <h1 className="mt-4 text-2xl font-extrabold text-primary">تم غلق الموقع</h1>
        <p className="mt-3 whitespace-pre-line text-sm leading-7 text-muted-foreground">{message.trim() || "الموقع مغلق مؤقتًا. هنرجع قريب إن شاء الله."}</p>
        <a href={waLink(WHATSAPP_NUMBER, "مرحبًا فاليو عقار")} target="_blank" rel="noreferrer"
          className="mt-6 inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-whatsapp px-5 text-sm font-bold text-primary-foreground hover:brightness-95">
          <MessageCircle className="size-4" />تواصل معانا واتساب
        </a>
      </div>
    </main>
  );
}
