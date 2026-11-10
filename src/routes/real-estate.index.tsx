import { createFileRoute } from "@tanstack/react-router";
import { t, useLang } from "@/lib/i18n";
import { pageHead, breadcrumbs, SITE_NAME } from "@/lib/seo";
import { PageShell } from "@/components/site/ui";
import { fetchSearchEverything } from "@/components/site/search-everything";
import type { Property } from "@/components/site/data";
import { PLACE_DEFS, landingTitle, liveLandings } from "@/lib/landings";

/** «ابحث حسب النوع»: every search page that has listings, grouped by place (the hub that links them all). */
export const Route = createFileRoute("/real-estate/")({
  loader: async ({ context }) => {
    const all = await context.queryClient.ensureQueryData({ queryKey: ["search-everything"], queryFn: fetchSearchEverything }).catch(() => [] as Property[]);
    return liveLandings(all).map((x) => ({ slug: x.landing.slug, place: x.landing.place.slug, title: landingTitle(x.landing), count: x.count }));
  },
  head: () => pageHead({
    path: "/real-estate",
    title: `شقق ومحلات وعمارات وأراضي للبيع والإيجار في برج العرب والساحل | ${SITE_NAME}`,
    description: "كل العقارات المتاحة على فاليو عقار حسب النوع: شقق، بيوت وعمارات، فيلات، أراضي، محلات، عيادات، مكاتب وشاليهات، للبيع والإيجار في برج العرب الجديدة والعلمين والساحل الشمالي.",
    jsonLd: [breadcrumbs([{ name: "الرئيسية", path: "/" }, { name: "ابحث حسب النوع", path: "/real-estate" }])],
  }),
  component: Hub,
});

function Hub() {
  useLang();
  const pages = Route.useLoaderData();
  return (
    <PageShell>
      <div className="mx-auto max-w-5xl px-4 py-8 md:px-6">
        <h1 className="text-2xl font-extrabold text-primary md:text-3xl">{t("عقارات للبيع والإيجار حسب النوع")}</h1>
        <p className="mt-2 text-muted-foreground">{t("اختار اللي بتدوّر عليه وشوف كل العروض المتاحة بأسعارها وصورها.")}</p>
        {PLACE_DEFS.map((place) => {
          const here = pages.filter((p) => p.place === place.slug);
          if (!here.length) return null;
          return (
            <section key={place.slug} className="mt-8">
              <h2 className="text-xl font-extrabold text-primary">{t(place.label)}</h2>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {here.map((p) => (
                  <li key={p.slug}>
                    <a href={`/real-estate/${p.slug}`} className="flex items-center justify-between rounded-2xl border bg-card px-4 py-3 font-bold text-primary transition hover:border-teal">
                      <span>{p.title}</span><span className="rounded-full bg-teal-soft px-2.5 py-0.5 text-xs">{p.count}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
        {!pages.length && <p className="mt-8 text-muted-foreground">{t("لسه مفيش عروض متاحة دلوقتي.")}</p>}
      </div>
    </PageShell>
  );
}
