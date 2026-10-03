import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Store, MapPin, Maximize, Layers, MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageShell, inputCls, btnOutline } from "@/components/site/ui";
import { PUBLIC_BROKER_COLS, formatPrice, waLink, type PublicBroker } from "@/components/site/data";
import { MALL_UNIT_TYPES, fetchMallUnits } from "@/components/site/malls";
import { pageHead, unavailableHead, breadcrumbs, SITE_NAME, SITE_URL } from "@/lib/seo";

async function fetchMall(id: string) {
  const { data, error } = await supabase.from("malls").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export const Route = createFileRoute("/malls/$id")({
  loader: ({ params, context }) =>
    context.queryClient.ensureQueryData({ queryKey: ["mall", params.id], queryFn: () => fetchMall(params.id) }),
  head: ({ params, loaderData: m }) => {
    const path = `/malls/${params.id}`;
    if (!m || !m.is_active) return unavailableHead(path, "المول غير متاح");
    const where = m.location ? ` في ${m.location}` : "";
    const title = `${m.name}${where} – محلات ومكاتب للبيع والإيجار | ${SITE_NAME}`;
    const description = `الوحدات المتاحة للبيع والإيجار داخل ${m.name}${where}. ${m.description ?? ""}`;
    return pageHead({
      path, title, description, image: m.logo_url,
      jsonLd: [
        {
          "@context": "https://schema.org", "@type": "ShoppingCenter", name: m.name, url: `${SITE_URL}${path}`,
          description: m.description || undefined, logo: m.logo_url && /^https:/.test(m.logo_url) ? m.logo_url : undefined,
          address: m.location ? { "@type": "PostalAddress", addressLocality: m.location, addressCountry: "EG" } : undefined,
        },
        breadcrumbs([{ name: "الرئيسية", path: "/" }, { name: "المولات", path: "/malls" }, { name: m.name, path }]),
      ],
    });
  },
  component: MallPage,
});

function MallPage() {
  const { id } = Route.useParams();
  const initial = Route.useLoaderData();
  const mall = useQuery({ queryKey: ["mall", id], queryFn: () => fetchMall(id), initialData: initial });
  const units = useQuery({ queryKey: ["mall-units", id], queryFn: () => fetchMallUnits(id) });
  const brokerIds = [...new Set((units.data ?? []).map((u) => u.broker_id).filter(Boolean))] as string[];
  const brokers = useQuery({
    queryKey: ["mall-brokers", brokerIds], enabled: brokerIds.length > 0,
    queryFn: async () => ((await supabase.from("brokers").select(PUBLIC_BROKER_COLS).in("id", brokerIds)).data ?? []) as PublicBroker[],
  });
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const rows = useMemo(() => (units.data ?? []).filter((u) => (!status || u.status === status) && (!type || u.type === type)), [units.data, status, type]);

  if (mall.isLoading) return <PageShell><div className="mx-auto mt-6 h-60 max-w-6xl animate-pulse rounded-2xl bg-muted" /></PageShell>;
  const m = mall.data;
  if (!m) return <PageShell><div className="mx-auto mt-10 max-w-md p-6 text-center"><p className="font-bold text-primary">المول غير متاح</p><Link to="/malls" className={`${btnOutline} mt-4`}>كل المولات</Link></div></PageShell>;

  return (
    <PageShell>
      <section className="bg-primary px-4 py-8 text-primary-foreground md:px-6">
        <div className="mx-auto flex max-w-6xl items-center gap-4">
          <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-2xl bg-card md:size-28">
            {m.logo_url ? <img src={m.logo_url} alt={`لوجو ${m.name}`} className="size-full object-contain" /> : <Store className="size-10 text-teal" />}
          </div>
          <div>
            <h1 className="text-2xl font-extrabold md:text-4xl">{m.name}</h1>
            {m.location && <p className="mt-1 flex items-center gap-1 text-sm text-primary-foreground/80"><MapPin className="size-4 text-teal" />{m.location}</p>}
          </div>
        </div>
        {m.description && <p className="mx-auto mt-4 max-w-6xl text-sm whitespace-pre-line text-primary-foreground/80">{m.description}</p>}
      </section>
      <div className="mx-auto max-w-6xl px-4 pt-5 md:px-6">
        <div className="grid grid-cols-2 gap-2">
          <select aria-label="نوع الوحدة" className={inputCls} value={type} onChange={(e) => setType(e.target.value)}><option value="">كل الوحدات</option>{MALL_UNIT_TYPES.map((t) => <option key={t}>{t}</option>)}</select>
          <select aria-label="الحالة" className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)}><option value="">بيع وإيجار</option><option value="بيع">للبيع</option><option value="إيجار">للإيجار</option></select>
        </div>
        <p className="mt-3 text-sm font-bold text-primary">{units.isLoading ? "جارٍ التحميل..." : `${rows.length} وحدة متاحة`}</p>
        {!units.isLoading && rows.length === 0 && <p className="mt-4 rounded-2xl border border-dashed bg-card p-10 text-center text-sm text-muted-foreground">لا توجد وحدات متاحة حاليًا في هذا المول.</p>}
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((u) => {
            const b = brokers.data?.find((x) => x.id === u.broker_id);
            return (
              <div key={u.id} className="overflow-hidden rounded-2xl border bg-card shadow-card">
                <div className="relative aspect-[4/3] bg-muted">
                  {u.image_url ? <img src={u.image_url} alt={u.title} loading="lazy" className="size-full object-cover" /> : <div className="grid size-full place-items-center"><Store className="size-12 text-muted-foreground" /></div>}
                  <span className="absolute top-3 right-3 rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground">لل{u.status}</span>
                </div>
                <div className="p-4">
                  <p className="text-xs font-bold text-teal">{u.type}</p>
                  <h2 className="mt-1 font-extrabold text-primary">{u.title}</h2>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold text-primary">
                    <span className="flex items-center gap-1 rounded-lg bg-secondary px-2 py-1"><Maximize className="size-3.5" />{formatPrice(Number(u.size))} م²</span>
                    {u.floor && <span className="flex items-center gap-1 rounded-lg bg-secondary px-2 py-1"><Layers className="size-3.5" />{u.floor}</span>}
                  </div>
                  {u.description && <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{u.description}</p>}
                  <p className="mt-3 text-lg font-extrabold text-primary">{formatPrice(Number(u.price))} <span className="text-xs text-muted-foreground">ج.م{u.status === "إيجار" ? " / شهريًا" : ""}</span></p>
                  <a href={waLink(b?.whatsapp || b?.phone, `مرحبًا، أستفسر عن وحدة "${u.title}" في ${m.name}`)} target="_blank" rel="noreferrer" className="mt-3 flex h-11 items-center justify-center gap-1.5 rounded-xl bg-whatsapp text-sm font-bold text-primary-foreground hover:brightness-95"><MessageCircle className="size-4" />استفسر واتساب</a>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </PageShell>
  );
}
