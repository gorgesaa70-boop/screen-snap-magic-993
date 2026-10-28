import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Eye, MousePointerClick, MessageSquareText, Radar, Lightbulb } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatPrice } from "@/components/site/data";

type Day = { day: string; impressions: number; views: number; contacts: number | null; leads: number };
type Row = { id: string; title: string; image: string | null; impressions: number; views: number; contacts: number | null; leads: number };
type Stats = { level: "basic" | "full" | "report"; days: number; max_days: number; series: Day[]; listings: Row[]; sources: Record<string, number> | null };

const SOURCE_LABEL: Record<string, string> = {
  home: "الصفحة الرئيسية", search: "البحث والخريطة", listing: "صفحات تانية في الموقع", whatsapp: "واتساب", facebook: "فيسبوك",
  instagram: "إنستجرام", tiktok: "تيك توك", google: "جوجل", direct: "دخول مباشر", other: "مواقع تانية",
};
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 1000) / 10}%` : "—");

/** A tip for one listing, from its numbers (shown only when there's enough to judge). */
function tip(r: Row) {
  if (r.impressions >= 50 && r.views / r.impressions < 0.03) return "ناس كتير شافته ومافتحوش: جرّب صورة أوضح في الأول أو عنوان أدق.";
  if (r.views >= 30 && r.leads === 0) return "مشاهدات عالية ومفيش طلبات: راجع السعر، أو اطلب تصوير احترافي.";
  return null;
}

/** «الإحصائيات»: showings, views, contacts and requests of the account's (or owner's) listings, by day and by listing. */
export function ListingStats() {
  const [days, setDays] = useState(30);
  const q = useQuery({
    queryKey: ["my-listing-stats", days],
    queryFn: async () => { const { data, error } = await supabase.rpc("my_listing_stats", { _days: days }); if (error) throw error; return data as unknown as Stats | null; },
  });
  if (q.isLoading) return <div className="h-48 animate-pulse rounded-2xl bg-muted" />;
  if (q.error) return <p className="rounded-2xl border bg-card p-4 text-sm text-destructive">{(q.error as Error).message}</p>;
  const s = q.data;
  if (!s) return null;
  const full = s.level !== "basic";
  const tot = s.series.reduce((a, d) => ({ i: a.i + d.impressions, v: a.v + d.views, c: a.c + (d.contacts ?? 0), l: a.l + d.leads }), { i: 0, v: 0, c: 0, l: 0 });
  const peak = Math.max(1, ...s.series.map((d) => d.views));
  const periods = [7, 30, 90].filter((n) => n <= s.max_days);
  const tiles = [
    { icon: Radar, label: "الظهور", value: formatPrice(tot.i), hint: "مرات ظهور إعلاناتك في القوايم والبحث" },
    { icon: Eye, label: "المشاهدات", value: formatPrice(tot.v), hint: `نسبة المشاهدة ${pct(tot.v, tot.i)}` },
    ...(full ? [{ icon: MousePointerClick, label: "ضغطات التواصل", value: formatPrice(tot.c), hint: "واتساب واتصال" }] : []),
    { icon: MessageSquareText, label: "الطلبات", value: formatPrice(tot.l), hint: `نسبة التحويل ${pct(tot.l, tot.v)}` },
  ];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-extrabold text-primary">إحصائيات إعلاناتك — آخر {s.days} يوم</p>
        {periods.length > 1 && (
          <div className="flex gap-1.5" role="radiogroup" aria-label="المدة">
            {periods.map((n) => (
              <button key={n} role="radio" aria-checked={s.days === n} onClick={() => setDays(n)}
                className={`rounded-full border px-3 py-1.5 text-xs font-bold ${s.days === n ? "border-primary bg-primary text-primary-foreground" : "bg-card text-primary"}`}>{n} يوم</button>
            ))}
          </div>
        )}
      </div>
      <div className={`grid grid-cols-2 gap-3 ${full ? "md:grid-cols-4" : "md:grid-cols-3"}`}>
        {tiles.map(({ icon: Icon, label, value, hint }) => (
          <div key={label} className="rounded-2xl border bg-card p-4">
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground"><Icon className="size-4 text-teal" />{label}</p>
            <p className="mt-1 text-2xl font-extrabold text-primary">{value}</p>
            <p className="text-xs text-muted-foreground">{hint}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border bg-card p-4">
        <p className="text-sm font-bold text-primary">المشاهدات كل يوم</p>
        <div className="mt-3 flex h-32 items-end gap-0.5" role="img" aria-label={`المشاهدات في آخر ${s.days} يوم: ${tot.v}`}>
          {s.series.map((d) => (
            <div key={d.day} className="group relative flex h-full flex-1 items-end" title={`${d.day}: ${d.views} مشاهدة · ${d.impressions} ظهور · ${d.leads} طلب`}>
              <div className="w-full rounded-t bg-teal transition group-hover:bg-primary" style={{ height: `${Math.max(d.views ? 4 : 1, (d.views / peak) * 100)}%`, opacity: d.views ? 1 : 0.25 }} />
            </div>
          ))}
        </div>
        <div className="mt-1 flex justify-between text-[11px] text-muted-foreground"><span>{s.series[0]?.day}</span><span>النهارده</span></div>
      </div>

      {full && s.sources && Object.keys(s.sources).length > 0 && (
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-sm font-bold text-primary">الزوار جايين منين</p>
          <ul className="mt-2 space-y-1.5">
            {Object.entries(s.sources).sort((a, b) => b[1] - a[1]).map(([k, n]) => (
              <li key={k} className="flex items-center gap-2 text-sm">
                <span className="w-36 shrink-0 text-foreground/80">{SOURCE_LABEL[k] ?? k}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-secondary"><span className="block h-full rounded-full bg-teal" style={{ width: `${(n / Math.max(1, tot.v)) * 100}%` }} /></span>
                <span className="w-10 text-end font-bold text-primary">{formatPrice(n)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-secondary/60 text-xs text-muted-foreground">
            <tr><th className="p-2 text-start">الإعلان</th><th className="p-2">ظهور</th><th className="p-2">مشاهدات</th><th className="p-2">نسبة المشاهدة</th>{full && <th className="p-2">تواصل</th>}<th className="p-2">طلبات</th></tr>
          </thead>
          <tbody className="divide-y">
            {s.listings.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">لسه مفيش إعلانات منشورة.</td></tr>}
            {s.listings.map((r) => {
              const t = tip(r);
              return (
                <tr key={r.id} className="align-top">
                  <td className="p-2">
                    <a href={`/properties/${r.id}`} className="line-clamp-1 font-bold text-primary hover:underline">{r.title}</a>
                    {t && <p className="mt-0.5 flex items-start gap-1 text-xs text-[#b7791f]"><Lightbulb className="mt-0.5 size-3.5 shrink-0" />{t}</p>}
                  </td>
                  <td className="p-2 text-center">{formatPrice(r.impressions)}</td>
                  <td className="p-2 text-center">{formatPrice(r.views)}</td>
                  <td className="p-2 text-center">{pct(r.views, r.impressions)}</td>
                  {full && <td className="p-2 text-center">{formatPrice(r.contacts ?? 0)}</td>}
                  <td className="p-2 text-center font-bold text-primary">{formatPrice(r.leads)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!full && <p className="rounded-2xl border border-dashed bg-card p-3 text-xs text-muted-foreground">باقتك فيها الإحصائيات الأساسية لآخر 7 أيام. الباقات الأعلى بتوريك لحد 90 يوم، وضغطات التواصل، والزوار جايين منين.</p>}
      {s.level === "report" && <p className="text-xs text-muted-foreground">باقتك فيها تقرير شهري بالأرقام دي بيوصلك على واتساب من فريق فاليو عقار.</p>}
      <p className="text-[11px] text-muted-foreground">كل جهاز بيتحسب مرة واحدة في اليوم لكل إعلان، ومشاهداتك إنت لإعلاناتك مش بتتحسب. مش بنسجّل أي بيانات شخصية عن الزوار.</p>
    </div>
  );
}

/** The team's view: every account's totals for 30 days. */
export function AdminListingStats() {
  const q = useQuery({ queryKey: ["admin-listing-stats"], queryFn: async () => { const { data, error } = await supabase.rpc("admin_listing_stats", { _days: 30 }); if (error) throw error; return data ?? []; } });
  if (q.isLoading) return <div className="h-24 animate-pulse rounded-2xl bg-muted" />;
  if (q.error) return null;
  return (
    <div className="space-y-2 rounded-2xl border bg-card p-4">
      <p className="font-bold text-primary">إحصائيات الحسابات — آخر 30 يوم</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="text-xs text-muted-foreground"><tr><th className="p-2 text-start">الحساب</th><th className="p-2">إعلانات</th><th className="p-2">ظهور</th><th className="p-2">مشاهدات</th><th className="p-2">تواصل</th><th className="p-2">طلبات</th></tr></thead>
          <tbody className="divide-y">
            {(q.data ?? []).map((r) => (
              <tr key={r.broker_id ?? "owners"}><td className="p-2 font-bold text-primary">{r.account}</td><td className="p-2 text-center">{formatPrice(r.listings)}</td><td className="p-2 text-center">{formatPrice(Number(r.impressions))}</td><td className="p-2 text-center">{formatPrice(Number(r.views))}</td><td className="p-2 text-center">{formatPrice(Number(r.contacts))}</td><td className="p-2 text-center">{formatPrice(Number(r.leads))}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
