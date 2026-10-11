import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bell, Briefcase, FileSearch, Heart } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { DashShell } from "./DashShell";
import { btnOutline } from "@/components/site/ui";

/** Landing page for a signed-in customer: favourites, alerts and requests, plus the way to join as a broker. */
export function CustomerHome() {
  const q = useQuery({
    queryKey: ["customer-counts"],
    queryFn: async () => {
      const [fav, alerts, reqs] = await Promise.all([
        supabase.from("favorites").select("property_id", { count: "exact", head: true }),
        supabase.from("saved_searches").select("id", { count: "exact", head: true }),
        supabase.rpc("my_requests"),
      ]);
      return { fav: fav.count ?? 0, alerts: alerts.count ?? 0, reqs: reqs.data?.length ?? 0 };
    },
  });
  const card = "flex items-center gap-4 rounded-2xl border bg-card p-5 transition hover:border-teal hover:shadow-card";
  const icon = "grid size-12 shrink-0 place-items-center rounded-xl bg-teal-soft text-primary";
  return (
    <DashShell title="صفحتي" customer>
      <div className="grid max-w-4xl gap-3 sm:grid-cols-3">
        <Link to="/favorites" className={card}><span className={icon}><Heart className="size-6" /></span>
          <span><span className="block text-2xl font-extrabold text-primary">{q.data?.fav ?? "—"}</span><span className="text-sm font-bold text-muted-foreground">عقارات في المفضلة</span></span></Link>
        <Link to="/favorites" hash="alerts" className={card}><span className={icon}><Bell className="size-6" /></span>
          <span><span className="block text-2xl font-extrabold text-primary">{q.data?.alerts ?? "—"}</span><span className="text-sm font-bold text-muted-foreground">تنبيهات «نبّهني»</span></span></Link>
        <Link to="/my-requests" className={card}><span className={icon}><FileSearch className="size-6" /></span>
          <span><span className="block text-2xl font-extrabold text-primary">{q.data?.reqs ?? "—"}</span><span className="text-sm font-bold text-muted-foreground">طلباتي واستفساراتي</span></span></Link>
      </div>
      <div className="mt-4 flex max-w-4xl flex-wrap gap-2">
        <a href="/#search" className={btnOutline}>دوّر على عقار</a>
        <a href="/#request" className={btnOutline}>اطلب عقارك</a>
      </div>
      <div className="mt-8 flex max-w-4xl flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed bg-card p-5">
        <div className="flex items-center gap-3">
          <Briefcase className="size-8 shrink-0 text-teal" />
          <div><p className="font-bold text-primary">إنت وسيط أو شركة تسويق أو تطوير؟</p><p className="text-sm text-muted-foreground">قدّم طلب انضمام، وبعد المراجعة تقدر تنشر عقاراتك وتستقبل عملاء.</p></div>
        </div>
        <Link to="/join" className={btnOutline}>طلب الانضمام</Link>
      </div>
    </DashShell>
  );
}
