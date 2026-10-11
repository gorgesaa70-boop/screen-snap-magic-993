import { t, useLang } from "@/lib/i18n";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { MapPin, MessageCircle, Phone, Mail, Facebook } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageShell, Avatar, btnOutline } from "@/components/site/ui";
import { PropertyCard } from "@/components/site/Sections";
import { PUBLIC_BROKER_COLS, fetchPublicProperties, waLink, withContacts, type PublicBroker } from "@/components/site/data";
import { BrokerInquiry } from "@/components/site/BrokerInquiry";
import { pageHead, unavailableHead, breadcrumbs, SITE_NAME, SITE_URL } from "@/lib/seo";

async function fetchBroker(slug: string) {
  const { data, error } = await supabase.from("brokers").select(PUBLIC_BROKER_COLS).eq("slug", slug).eq("is_active", true).maybeSingle();
  if (error) throw error;
  return data ? ((await withContacts([data]))[0] as PublicBroker) : null;
}

export const Route = createFileRoute("/brokers/$slug")({
  loader: ({ params, context }) =>
    context.queryClient.ensureQueryData({ queryKey: ["broker", params.slug], queryFn: () => fetchBroker(params.slug) }),
  head: ({ params, loaderData: b }) => {
    const path = `/brokers/${params.slug}`;
    if (!b) return unavailableHead(path, "الوسيط غير موجود");
    const areas = (b.areas ?? []).join("، ");
    const title = `${b.name}${b.specialty ? ` – ${b.specialty}` : ""} | وسيط عقاري على ${SITE_NAME}`;
    const description = `${b.name} وسيط عقاري${areas ? ` في ${areas}` : ""}. ${b.bio ?? "تعرّف على عقاراته المعتمدة وتواصل معه مباشرة."}`;
    return pageHead({
      path, title, description, image: b.photo_url, type: "profile",
      jsonLd: [
        {
          "@context": "https://schema.org", "@type": "RealEstateAgent", name: b.name, url: `${SITE_URL}${path}`,
          description: b.bio || undefined, image: b.photo_url && /^https:/.test(b.photo_url) ? b.photo_url : undefined,
          areaServed: b.areas?.length ? b.areas : undefined,
        },
        breadcrumbs([{ name: "الرئيسية", path: "/" }, { name: "الوسطاء", path: "/brokers" }, { name: b.name, path }]),
      ],
    });
  },
  component: BrokerProfile,
});

function BrokerProfile() {
  useLang();
  const { slug } = Route.useParams();
  const initial = Route.useLoaderData();
  const broker = useQuery({ queryKey: ["broker", slug], queryFn: () => fetchBroker(slug), initialData: initial });
  const b = broker.data;
  const props = useQuery({ queryKey: ["broker-props", b?.id], enabled: !!b, queryFn: () => b ? fetchPublicProperties(b.id) : Promise.resolve([]) });

  if (broker.isLoading) return <PageShell><div className="mx-auto max-w-5xl p-6"><div className="h-48 animate-pulse rounded-2xl bg-muted" /></div></PageShell>;
  if (!b) return (
    <PageShell><div className="mx-auto max-w-md p-10 text-center"><h1 className="text-xl font-bold text-primary">{t("الوسيط غير موجود")}</h1><Link to="/brokers" className={`${btnOutline} mt-6`}>{t("كل الوسطاء")}</Link></div></PageShell>
  );
  return (
    <PageShell>
      <section className="bg-primary">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-10 md:flex-row md:items-center md:px-6">
          <Avatar name={b.name} url={b.photo_url} size="size-24" />
          <div className="flex-1">
            <h1 className="text-2xl font-extrabold text-primary-foreground md:text-3xl">{b.name}</h1>
            <p className="mt-1 text-primary-foreground/80">{b.specialty}</p>
            <p className="mt-3 flex items-start gap-2 text-sm text-primary-foreground/80"><MapPin className="mt-0.5 size-4 shrink-0 text-teal" />{b.areas.map((area) => t(area)).join(" / ") || "—"}</p>
          </div>
          <div className="grid grid-cols-2 gap-2 md:flex">
            <a href={waLink(b.whatsapp || b.phone, b.whatsapp || b.phone ? t("مرحبًا {name}، تواصلت معك عبر فاليو عقار", { name: b.name }) : t("مرحبًا فاليو عقار، أستفسر عن الوسيط {name}", { name: b.name }))} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-whatsapp px-5 text-sm font-bold text-primary-foreground hover:brightness-95"><MessageCircle className="size-4" />{t("واتساب")}</a>
            {b.phone && <a href={`tel:${b.phone}`} className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-teal px-5 text-sm font-bold text-accent-foreground hover:brightness-95"><Phone className="size-4" />{t("اتصال")}</a>}
          </div>
        </div>
      </section>
      <div className="mx-auto grid max-w-7xl gap-6 px-4 pt-8 md:px-6 lg:grid-cols-[300px_1fr]">
        <aside className="h-fit space-y-4 rounded-2xl border bg-card p-5">
          <h2 className="font-bold text-primary">{t("نبذة تعريفية")}</h2>
          <p className="text-sm leading-relaxed text-foreground/80">{b.bio || t("لم يضف الوسيط نبذة بعد.")}</p>
          <ul className="space-y-2 border-t pt-4 text-sm">
            {b.phone && <li className="flex items-center gap-2" dir="ltr"><Phone className="size-4 text-teal" />{b.phone}</li>}
            {b.email && <li className="flex items-center gap-2"><Mail className="size-4 text-teal" /><span className="truncate">{b.email}</span></li>}
            {b.facebook && <li><a href={b.facebook} target="_blank" rel="noreferrer" className="flex items-center gap-2 hover:text-teal"><Facebook className="size-4 text-teal" />{t("فيسبوك")}</a></li>}
          </ul>
          {b.is_demo && <p className="text-[11px] text-muted-foreground">{t("* بيانات تجريبية.")}</p>}
          {!b.phone && <BrokerInquiry brokerId={b.id} brokerName={b.name} />}
        </aside>
        <section>
          <h2 className="mb-4 text-xl font-extrabold text-primary">{t("العقارات المسجلة")} ({props.data?.length ?? 0})</h2>
          {props.data && props.data.length === 0 && <p className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">{t("لا توجد عقارات معتمدة لهذا الوسيط حاليًا.")}</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            {props.data?.map((p) => <PropertyCard key={p.id} p={p} whatsapp={b.whatsapp || b.phone} />)}
          </div>
        </section>
      </div>
    </PageShell>
  );
}
