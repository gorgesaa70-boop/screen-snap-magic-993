import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Factory, MapPin, Maximize, MessageCircle, Briefcase } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageShell, Avatar, btnOutline } from "@/components/site/ui";
import { PUBLIC_BROKER_COLS, formatPrice, formatDate, waLink, type PublicBroker } from "@/components/site/data";

export const Route = createFileRoute("/industrial/$id")({
  head: () => ({
    meta: [
      { title: "تفاصيل عقار صناعي | فاليو عقار" },
      { name: "description", content: "مواصفات الأرض أو المصنع وموقعه وسعره ووسيلة التواصل مع الوسيط." },
      { property: "og:title", content: "تفاصيل عقار صناعي | فاليو عقار" },
      { property: "og:description", content: "تفاصيل عقار صناعي على فاليو عقار." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

function Page() {
  const { id } = Route.useParams();
  const q = useQuery({
    queryKey: ["industrial", id],
    queryFn: async () => {
      const { data: p, error } = await supabase.from("properties").select("*, industrial_activities(name)").eq("id", id).eq("category", "industrial").maybeSingle();
      if (error) throw error;
      if (!p) return null;
      let broker: PublicBroker | null = null;
      if (p.broker_id) broker = ((await supabase.from("brokers").select(PUBLIC_BROKER_COLS).eq("id", p.broker_id).maybeSingle()).data as PublicBroker | null) ?? null;
      return { p, broker };
    },
  });
  if (q.isLoading) return <PageShell><div className="mx-auto mt-6 h-80 max-w-6xl animate-pulse rounded-2xl bg-muted" /></PageShell>;
  if (!q.data) return <PageShell><div className="mx-auto mt-10 max-w-md p-6 text-center"><p className="font-bold text-primary">العقار غير متاح</p><Link to="/industrial" className={`${btnOutline} mt-4`}>كل العقارات الصناعية</Link></div></PageShell>;
  const { p, broker } = q.data;
  const key = import.meta.env["VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY"] as string | undefined;
  const chip = "flex items-center gap-1 rounded-lg bg-secondary px-3 py-1.5";
  return (
    <PageShell>
      <div className="mx-auto grid max-w-6xl gap-6 px-4 pt-6 md:px-6 lg:grid-cols-[1fr_360px]">
        <div>
          <div className="relative overflow-hidden rounded-2xl bg-muted">
            {p.image_url ? <img src={p.image_url} alt={p.title} className="aspect-[4/3] w-full object-cover md:aspect-video" /> : <div className="grid aspect-video place-items-center"><Factory className="size-16 text-muted-foreground" /></div>}
            <span className="absolute top-3 right-3 rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground">لل{p.status}</span>
          </div>
          <h1 className="mt-5 text-2xl font-extrabold text-primary md:text-3xl">{p.title}</h1>
          <p className="mt-2 text-2xl font-extrabold text-teal">{formatPrice(Number(p.price))} <span className="text-sm text-muted-foreground">ج.م{p.status === "إيجار" ? " / شهريًا" : ""}</span></p>
          <div className="mt-4 flex flex-wrap gap-2 text-sm font-semibold text-primary">
            <span className={chip}><Factory className="size-4 text-teal" />{p.type}</span>
            <span className={chip}><MapPin className="size-4 text-teal" />{p.area}</span>
            {p.industrial_activities?.name && <span className={chip}><Briefcase className="size-4 text-teal" />{p.industrial_activities.name}</span>}
            {p.land_size != null && <span className={chip}><Maximize className="size-4 text-teal" />مساحة الأرض {formatPrice(Number(p.land_size))} م²</span>}
            {p.built_size != null && <span className={chip}><Maximize className="size-4 text-teal" />المساحة المبنية {formatPrice(Number(p.built_size))} م²</span>}
          </div>
          {p.address && <p className="mt-3 text-sm text-muted-foreground">الموقع التفصيلي: {p.address}</p>}
          <p className="mt-5 leading-relaxed whitespace-pre-line text-foreground/80">{p.description || "لا يوجد وصف إضافي."}</p>
          {p.video_urls.length > 0 && (
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {p.video_urls.map((v) => <video key={v} src={v} controls preload="metadata" className="aspect-video w-full rounded-2xl bg-muted" />)}
            </div>
          )}
          {p.lat != null && p.lng != null && key && (
            <div className="mt-6">
              <h2 className="mb-2 flex items-center gap-1.5 text-lg font-extrabold text-primary"><MapPin className="size-5 text-teal" />الموقع على الخريطة</h2>
              <iframe title="موقع العقار على الخريطة" src={`https://www.google.com/maps/embed/v1/place?key=${key}&q=${p.lat},${p.lng}&zoom=15&language=ar&region=EG`} className="h-64 w-full rounded-2xl border bg-muted md:h-80" loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen />
            </div>
          )}
          <p className="mt-3 text-xs text-muted-foreground">آخر تحديث: {formatDate(p.updated_at)}</p>
        </div>
        <aside className="h-fit space-y-4 lg:sticky lg:top-20">
          {broker && (
            <div className="rounded-2xl border bg-card p-5">
              <p className="mb-3 text-xs font-bold text-muted-foreground">الوسيط المسؤول</p>
              <div className="flex items-center gap-3">
                <Avatar name={broker.name} url={broker.photo_url} size="size-12" />
                <div className="min-w-0"><p className="truncate font-bold text-primary">{broker.name}</p><Link to="/brokers/$slug" params={{ slug: broker.slug }} className="text-xs font-bold text-teal">عرض الملف</Link></div>
              </div>
              <a href={waLink(broker.whatsapp || broker.phone, `مرحبًا، أستفسر عن: ${p.title}`)} target="_blank" rel="noreferrer" className="mt-4 flex h-11 items-center justify-center gap-1.5 rounded-xl bg-whatsapp text-sm font-bold text-primary-foreground hover:brightness-95"><MessageCircle className="size-4" />تواصل واتساب</a>
            </div>
          )}
          <Link to="/industrial" className={`${btnOutline} w-full`}>كل العقارات الصناعية</Link>
        </aside>
      </div>
    </PageShell>
  );
}
