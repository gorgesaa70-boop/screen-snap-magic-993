import { t, useLang } from "@/lib/i18n";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { MapPin, MessageCircle, Phone, Mail, Facebook } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageShell, Avatar, btnOutline } from "@/components/site/ui";
import { PropertyCard } from "@/components/site/Sections";
import { PUBLIC_BROKER_COLS, citiesOf, useLocations, fetchPublicProperties, waLink, withContacts, type PublicBroker } from "@/components/site/data";
import { BrokerInquiry } from "@/components/site/BrokerInquiry";
import { DirectMessageButton } from "@/components/site/DirectMessageButton";
import { useMe } from "@/hooks/useAuth";
import { compoundCover, compoundWhere } from "@/components/site/compounds";
import { projectCover } from "@/components/site/projects";
import { pageHead, unavailableHead, breadcrumbs, SITE_NAME, SITE_URL } from "@/lib/seo";
import { thumb } from "@/lib/images";

/** A developer's compounds, malls and projects (public ones only — the database hides the rest). */
async function fetchDeveloperPortfolio(id: string) {
  const [c, m, p] = await Promise.all([
    supabase.from("compounds").select("id,name,images,logo_url,area,city,location").eq("developer_id", id).eq("is_active", true).eq("review_status", "approved").order("sort_order"),
    supabase.from("malls").select("id,name,logo_url,location").eq("developer_id", id).eq("is_active", true).order("sort_order"),
    supabase.from("projects").select("id,name,images,area").eq("developer_id", id).eq("review_status", "approved").order("created_at", { ascending: false }),
  ]);
  return { compounds: c.data ?? [], malls: m.data ?? [], projects: p.data ?? [] };
}

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
      path, title, description, image: b.photo_url, type: "profile", noindex: !!b.is_demo,
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
  useLocations();
  const { slug } = Route.useParams();
  const initial = Route.useLoaderData();
  const broker = useQuery({ queryKey: ["broker", slug], queryFn: () => fetchBroker(slug), initialData: initial });
  const b = broker.data;
  const { me } = useMe();
  // Other brokers (account holders and managers) can message this one inside the platform.
  const canMessage = !!b && !b.is_demo && !!me?.broker && me.broker.id !== b.id && (me.memberRole === "owner" || me.memberRole === "manager")
    && !["owner"].includes(me.broker.account_type) && b.account_type !== "owner";
  const props = useQuery({ queryKey: ["broker-props", b?.id], enabled: !!b, queryFn: () => b ? fetchPublicProperties(b.id) : Promise.resolve([]) });
  const portfolio = useQuery({ queryKey: ["developer-portfolio", b?.id], enabled: b?.account_type === "developer", queryFn: () => fetchDeveloperPortfolio(b!.id) });
  const pf = portfolio.data;
  const card = "flex items-center gap-3 rounded-2xl border bg-card p-3 transition hover:border-teal";

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
            <p className="mt-3 flex items-start gap-2 text-sm text-primary-foreground/80"><MapPin className="mt-0.5 size-4 shrink-0 text-teal" />{citiesOf(b.areas).map((c) => t(c)).join(" · ") || "—"}</p>
          </div>
          <div className="grid grid-cols-2 gap-2 md:flex">
            <a href={waLink(b.whatsapp || b.phone, b.whatsapp || b.phone ? t("مرحبًا {name}، تواصلت معك عبر فاليو عقار", { name: b.name }) : t("مرحبًا فاليو عقار، أستفسر عن الوسيط {name}", { name: b.name }))} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-whatsapp px-5 text-sm font-bold text-primary-foreground hover:brightness-95"><MessageCircle className="size-4" />{t("واتساب")}</a>
            {canMessage && <DirectMessageButton brokerId={b.id} className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border border-primary-foreground/40 px-5 text-sm font-bold text-primary-foreground hover:bg-primary-foreground/10">{<><MessageCircle className="size-4" />{t("راسل")}</>}</DirectMessageButton>}
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
          {pf && pf.compounds.length + pf.malls.length + pf.projects.length > 0 && (
            <div className="mb-8 space-y-6">
              {pf.compounds.length > 0 && (
                <div>
                  <h2 className="mb-3 text-xl font-extrabold text-primary">{t("الكمبوندات")} ({pf.compounds.length})</h2>
                  <div className="grid gap-3 sm:grid-cols-2">{pf.compounds.map((c) => (
                    <Link key={c.id} to="/compounds/$id" params={{ id: c.id }} className={card}>
                      <img src={thumb(compoundCover(c))} alt="" loading="lazy" className="size-16 shrink-0 rounded-xl object-cover" />
                      <div className="min-w-0"><p className="truncate font-bold text-primary">{c.name}</p><p className="truncate text-xs text-muted-foreground">{t(compoundWhere(c))}</p></div>
                    </Link>))}
                  </div>
                </div>
              )}
              {pf.malls.length > 0 && (
                <div>
                  <h2 className="mb-3 text-xl font-extrabold text-primary">{t("المولات")} ({pf.malls.length})</h2>
                  <div className="grid gap-3 sm:grid-cols-2">{pf.malls.map((m) => (
                    <Link key={m.id} to="/malls/$id" params={{ id: m.id }} className={card}>
                      <img src={thumb(m.logo_url) || "/demo/p2.jpg"} alt="" loading="lazy" className="size-16 shrink-0 rounded-xl object-cover" />
                      <div className="min-w-0"><p className="truncate font-bold text-primary">{m.name}</p>{m.location && <p className="truncate text-xs text-muted-foreground">{m.location}</p>}</div>
                    </Link>))}
                  </div>
                </div>
              )}
              {pf.projects.length > 0 && (
                <div>
                  <h2 className="mb-3 text-xl font-extrabold text-primary">{t("المشروعات")} ({pf.projects.length})</h2>
                  <div className="grid gap-3 sm:grid-cols-2">{pf.projects.map((p) => (
                    <Link key={p.id} to="/projects/$id" params={{ id: p.id }} className={card}>
                      <img src={thumb(projectCover(p))} alt="" loading="lazy" className="size-16 shrink-0 rounded-xl object-cover" />
                      <div className="min-w-0"><p className="truncate font-bold text-primary">{p.name}</p><p className="truncate text-xs text-muted-foreground">{t(p.area)}</p></div>
                    </Link>))}
                  </div>
                </div>
              )}
            </div>
          )}
          <h2 className="mb-4 text-xl font-extrabold text-primary">{t("العقارات المسجلة")} ({props.data?.length ?? 0})</h2>
          {props.data && props.data.length === 0 && <p className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">{t("الوسيط ده ماعندوش عقارات منشورة دلوقتي.")}</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            {props.data?.map((p) => <PropertyCard key={p.id} p={p} whatsapp={b.whatsapp || b.phone} />)}
          </div>
        </section>
      </div>
    </PageShell>
  );
}
