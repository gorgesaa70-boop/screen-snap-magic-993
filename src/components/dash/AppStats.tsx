import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Stat, inputCls, btnOutline } from "@/components/site/ui";
import { formatDate, formatPrice } from "@/components/site/data";

type Row = { label: string; n: number };
type Stats = {
  days: number; devices: number; today: number; platforms: Record<string, number>; searches: number; search_devices: number; top: Row[]; empty: Row[];
  views: number; contacts: number; requests: number; approved: number; verified: number; asked: number; hidden: number;
};
const n = (x: number | undefined) => formatPrice(x ?? 0);
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");

function Ranking({ title, hint, rows }: { title: string; hint: string; rows: Row[] }) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <p className="font-bold text-primary">{title}</p>
      <p className="text-xs text-muted-foreground">{hint}</p>
      {rows.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">لسه مفيش بيانات.</p> : (
        <ol className="mt-3 space-y-1.5 text-sm">{rows.map((r) => <li key={r.label} className="flex justify-between gap-3"><span className="min-w-0 truncate">{r.label}</span><b className="shrink-0 text-primary">{n(r.n)}</b></li>)}</ol>
      )}
    </div>
  );
}

/** «أداء التطبيق»: who opens the app, what they look for, and how fresh the listings are. */
export function AppStats({ canEdit }: { canEdit: boolean }) {
  const [days, setDays] = useState(30);
  const q = useQuery({
    queryKey: ["admin-data", "app-stats", days],
    queryFn: async () => { const { data, error } = await supabase.rpc("admin_app_stats", { _days: days }); if (error) throw error; return data as unknown as Stats; },
  });
  const hidden = useQuery({
    queryKey: ["admin-data", "stale-hidden"],
    queryFn: async () => (await supabase.from("properties").select("id, title, stale_hidden_at").not("stale_hidden_at", "is", null).order("stale_hidden_at", { ascending: false }).limit(100)).data ?? [],
  });
  const s = q.data;
  if (q.error) return <p className="max-w-2xl rounded-2xl border bg-card p-6 text-sm">أداء التطبيق محتاج تحديث قاعدة البيانات (إصدار 53) الأول.</p>;
  if (!s) return <div className="h-40 animate-pulse rounded-2xl bg-muted" />;
  return (
    <div className="space-y-4">
      <select aria-label="الفترة" className={`${inputCls} w-auto`} value={days} onChange={(e) => setDays(Number(e.target.value))}>
        <option value={7}>آخر 7 أيام</option><option value={30}>آخر 30 يوم</option><option value={90}>آخر 3 شهور</option>
      </select>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="أجهزة استخدمت" value={n(s.devices)} hint={`النهارده ${n(s.today)}`} />
        <Stat label="موقع" value={n(s.platforms["web"])} />
        <Stat label="أندرويد" value={n(s.platforms["android"])} />
        <Stat label="آيفون" value={n(s.platforms["ios"])} />
      </div>
      <div>
        <p className="mb-2 font-bold text-primary">رحلة العميل</p>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="عمليات بحث" value={n(s.searches)} hint={`${n(s.search_devices)} جهاز`} />
          <Stat label="فتح إعلان" value={n(s.views)} />
          <Stat label="تواصل" value={n(s.contacts)} hint={`${pct(s.contacts, s.views)} من اللي فتحوا إعلان`} />
          <Stat label="طلبات واستفسارات" value={n(s.requests)} />
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Ranking title="أكتر بحث" hint="الناس بتدوّر على إيه" rows={s.top} />
        <Ranking title="بحث من غير نتايج" hint="ده اللي محتاج تجيب عقارات زيه" rows={s.empty} />
      </div>
      <div>
        <p className="mb-2 font-bold text-primary">جودة الإعلانات</p>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="إعلانات معتمدة" value={n(s.approved)} />
          <Stat label="متحقق منها" value={n(s.verified)} hint={pct(s.verified, s.approved)} />
          <Stat label="مستنية تأكيد صاحبها" value={n(s.asked)} />
          <Stat label="استخبت لعدم التأكيد" value={n(s.hidden)} />
        </div>
      </div>
      {(hidden.data?.length ?? 0) > 0 && (
        <ul className="divide-y rounded-2xl border bg-card px-4 text-sm">
          {hidden.data!.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>{p.title} · <span className="text-xs text-muted-foreground">{formatDate(p.stale_hidden_at!)}</span></span>
              {canEdit && <button className={`${btnOutline} h-9 px-3 text-xs`} onClick={async () => { const { error } = await supabase.rpc("confirm_listing", { _id: p.id }); if (error) toast.error(error.message); else { toast.success("الإعلان رجع"); void hidden.refetch(); void q.refetch(); } }}>رجّعه</button>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
