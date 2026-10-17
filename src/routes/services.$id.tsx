import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { BadgeCheck, MapPin, Star, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { t, useLang } from "@/lib/i18n";
import { pageHead, unavailableHead, breadcrumbs, SITE_NAME, SITE_URL } from "@/lib/seo";
import { PageShell, Avatar, btnOutline } from "@/components/site/ui";
import { PROVIDER_KIND, SERVICE_CATEGORIES, formatDate, formatPrice, starsText } from "@/components/site/data";
import { ServiceRequestForm } from "@/components/site/ServiceForms";
import { thumb } from "@/lib/images";

type Profile = {
  id: string; kind: string; category: string; name: string; specialty: string | null; areas: string[]; bio: string | null; photo_url: string | null;
  verified: boolean; priority: number; since: string; rating: number | null; reviews_count: number; done: number;
  photos: { url: string; caption: string | null }[];
  reviews: { stars: number; comment: string | null; name: string; reply: string | null; at: string }[];
};

async function fetchProfile(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data, error } = await supabase.rpc("service_provider_profile", { _id: id });
  return error ? null : ((data as unknown as Profile | null) ?? null);
}

export const Route = createFileRoute("/services/$id")({
  loader: ({ params, context }) => context.queryClient.ensureQueryData({ queryKey: ["service-provider", params.id], queryFn: () => fetchProfile(params.id) }),
  head: ({ params, loaderData: p }) => {
    const path = `/services/${params.id}`;
    if (!p) return unavailableHead(path, "مقدم الخدمة غير موجود");
    const what = p.specialty || SERVICE_CATEGORIES[p.category];
    const areas = p.areas.join("، ");
    return pageHead({
      path, title: `${p.name} – ${what} | دليل الخدمات على ${SITE_NAME}`, type: "profile", image: p.photo_url,
      description: `${p.name}: ${what}${areas ? ` في ${areas}` : ""}.${p.rating != null ? ` تقييم ${p.rating} من 5 (${p.reviews_count} تقييم).` : ""} ${p.bio ?? "اطلب الخدمة عن طريق فاليو عقار."}`.slice(0, 300),
      jsonLd: [
        {
          "@context": "https://schema.org", "@type": "LocalBusiness", name: p.name, url: `${SITE_URL}${path}`, description: p.bio || undefined,
          image: p.photo_url && /^https:/.test(p.photo_url) ? p.photo_url : undefined, areaServed: p.areas.length ? p.areas : undefined,
          aggregateRating: p.rating != null && p.reviews_count > 0 ? { "@type": "AggregateRating", ratingValue: p.rating, reviewCount: p.reviews_count, bestRating: 5 } : undefined,
        },
        breadcrumbs([{ name: "الرئيسية", path: "/" }, { name: "الخدمات", path: "/services" }, { name: p.name, path }]),
      ],
    });
  },
  component: ProviderProfilePage,
});

/** A provider's public page: who they are, photos of their work, ratings from customers whose work they did, and asking them. */
function ProviderProfilePage() {
  useLang();
  const { id } = Route.useParams();
  const initial = Route.useLoaderData();
  const q = useQuery({ queryKey: ["service-provider", id], queryFn: () => fetchProfile(id), initialData: initial });
  const [zoom, setZoom] = useState<string | null>(null);
  const p = q.data;
  if (!p) return (
    <PageShell>
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p className="text-lg font-bold text-primary">{t("مقدم الخدمة ده مش متاح دلوقتي.")}</p>
        <Link to="/services" className={`${btnOutline} mt-4`}>{t("ارجع لدليل الخدمات")}</Link>
      </div>
    </PageShell>
  );
  return (
    <PageShell>
      <section className="bg-primary">
        <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-8 sm:flex-row sm:items-center md:px-6 md:py-10">
          <Avatar name={p.name} url={p.photo_url} size="size-24" />
          <div className="min-w-0 text-primary-foreground">
            <h1 className="flex flex-wrap items-center gap-2 text-2xl font-extrabold md:text-3xl">{p.name}{p.verified && <span className="inline-flex items-center gap-1 rounded-full bg-teal px-2.5 py-0.5 text-xs font-bold text-accent-foreground"><BadgeCheck className="size-3.5" />{t("معتمد من فاليو عقار")}</span>}</h1>
            <p className="mt-1 text-sm text-primary-foreground/80">{t(PROVIDER_KIND[p.kind] ?? "")} · {t(SERVICE_CATEGORIES[p.category] ?? "")}{p.specialty ? ` · ${p.specialty}` : ""}</p>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              {p.rating != null ? <span className="flex items-center gap-1 font-bold"><Star className="size-4 fill-[#f2b84b] text-[#f2b84b]" />{p.rating} <span className="font-normal text-primary-foreground/70">({t("{n} تقييم", { n: formatPrice(p.reviews_count) })})</span></span> : <span className="text-primary-foreground/70">{t("لسه مفيش تقييمات")}</span>}
              {p.done > 0 && <span className="text-primary-foreground/80">{t("{n} شغلانة اتنفّذت عن طريق فاليو عقار", { n: formatPrice(p.done) })}</span>}
              {p.areas.length > 0 && <span className="flex items-center gap-1 text-primary-foreground/80"><MapPin className="size-4" />{p.areas.map((a) => t(a)).join("، ")}</span>}
            </div>
          </div>
        </div>
      </section>
      <div className="mx-auto grid max-w-5xl gap-6 px-4 py-6 md:grid-cols-[1fr_340px] md:px-6">
        <div className="min-w-0 space-y-6">
          {p.bio && <section><h2 className="mb-2 text-lg font-extrabold text-primary">{t("عن الشغل")}</h2><p className="whitespace-pre-line text-sm leading-7 text-foreground/80">{p.bio}</p></section>}
          {p.photos.length > 0 && (
            <section>
              <h2 className="mb-2 text-lg font-extrabold text-primary">{t("صور من الشغل")}</h2>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {p.photos.map((ph, i) => (
                  <button key={i} type="button" onClick={() => setZoom(ph.url)} className="overflow-hidden rounded-xl border">
                    <img src={thumb(ph.url)} alt={ph.caption ?? p.name} loading="lazy" className="aspect-[4/3] w-full object-cover transition hover:scale-105" />
                  </button>
                ))}
              </div>
            </section>
          )}
          <section>
            <h2 className="mb-2 text-lg font-extrabold text-primary">{t("تقييمات العملاء")}</h2>
            <p className="mb-3 text-xs text-muted-foreground">{t("التقييمات من عملاء طلبوا الخدمة عن طريق فاليو عقار واتنفّذت فعلًا.")}</p>
            {p.reviews.length === 0 ? <p className="rounded-2xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">{t("لسه مفيش تقييمات.")}</p> : (
              <ul className="space-y-3">
                {p.reviews.map((r, i) => (
                  <li key={i} className="rounded-2xl border bg-card p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-bold text-primary">{r.name} <span className="text-[#f2b84b]" aria-label={`${r.stars} / 5`}>{starsText(r.stars)}</span></p>
                      <p className="text-xs text-muted-foreground">{formatDate(r.at)}</p>
                    </div>
                    {r.comment && <p className="mt-2 text-sm text-foreground/80">{r.comment}</p>}
                    {r.reply && <p className="mt-3 rounded-xl bg-secondary p-3 text-sm text-foreground/80"><span className="font-bold text-primary">{t("رد {name}:", { name: p.name })} </span>{r.reply}</p>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
        <aside className="md:sticky md:top-20 md:self-start">
          <ServiceRequestForm provider={{ id: p.id, name: p.name, category: p.category }} />
        </aside>
      </div>
      {zoom && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4" onClick={() => setZoom(null)}>
          <button type="button" aria-label={t("إغلاق")} className="absolute top-4 end-4 grid size-11 place-items-center rounded-full bg-card text-primary"><X className="size-5" /></button>
          <img src={zoom} alt="" className="max-h-full max-w-full rounded-xl object-contain" />
        </div>
      )}
    </PageShell>
  );
}
