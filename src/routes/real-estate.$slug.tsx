import { useState } from "react";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { t, useLang } from "@/lib/i18n";
import { pageHead, breadcrumbs, SITE_NAME, SITE_URL } from "@/lib/seo";
import { PageShell } from "@/components/site/ui";
import { PropertyCard } from "@/components/site/Sections";
import { fetchSearchEverything } from "@/components/site/search-everything";
import type { Property } from "@/components/site/data";
import { egp, findLanding, landingPath, landingStats, landingTitle, listingsFor, liveLandings, MIN_LISTINGS, type Landing } from "@/lib/landings";

type Related = { slug: string; title: string; count: number };
type Stats = ReturnType<typeof landingStats>;
const FIRST = 24;

export const Route = createFileRoute("/real-estate/$slug")({
  loader: async ({ params, context }) => {
    const landing = findLanding(params.slug);
    if (!landing) throw notFound();
    const all = await context.queryClient.ensureQueryData({ queryKey: ["search-everything"], queryFn: fetchSearchEverything }).catch(() => [] as Property[]);
    const list = listingsFor(landing, all);
    // Neighbouring searches that have listings: same type elsewhere / other purpose, other types here.
    const live = liveLandings(all).filter((x) => x.landing.slug !== landing.slug);
    const near = (x: { landing: Landing }) =>
      (x.landing.type === landing.type ? 2 : 0) + (x.landing.place === landing.place ? 2 : 0) + (x.landing.purpose === landing.purpose ? 1 : 0);
    const related: Related[] = live.sort((a, b) => near(b) - near(a) || b.count - a.count).slice(0, 10)
      .map((x) => ({ slug: x.landing.slug, title: landingTitle(x.landing), count: x.count }));
    // The numbers come from every listing; the page carries the first 60 (24 shown, the rest behind «عرض المزيد»).
    return { list: list.slice(0, 60), stats: landingStats(list), related };
  },
  head: ({ params, loaderData }) => {
    const landing = findLanding(params.slug);
    if (!landing || !loaderData) return {};
    const path = landingPath(landing);
    const title = landingTitle(landing);
    const s = loaderData.stats;
    const priceBit = s.min ? ` بأسعار من ${egp(s.min)}${s.max > s.min ? ` لحد ${egp(s.max)}` : ""}` : "";
    return pageHead({
      path,
      title: `${title} 2026 — أسعار وصور | ${SITE_NAME}`,
      description: s.count
        ? `${s.count} ${landing.type.plural} ${landing.purpose.label} في ${landing.place.label}${priceBit}. صور وتفاصيل حقيقية، وتواصل مباشر من خلال فاليو عقار.`
        : `${title}: لسه مفيش عروض متاحة دلوقتي على فاليو عقار. سيب طلبك ونبلّغك أول ما يتوفر.`,
      image: loaderData.list[0]?.image ?? null,
      // Empty pages stay out of Google until a listing appears.
      noindex: s.count < MIN_LISTINGS,
      jsonLd: s.count ? [
        breadcrumbs([{ name: "الرئيسية", path: "/" }, { name: "ابحث حسب النوع", path: "/real-estate" }, { name: title, path }]),
        {
          "@context": "https://schema.org", "@type": "ItemList", name: title, numberOfItems: s.count,
          itemListElement: loaderData.list.slice(0, 30).map((p, i) => ({ "@type": "ListItem", position: i + 1, url: `${SITE_URL}${cardPath(p)}`, name: p.title })),
        },
        { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq(landing, s).map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) },
      ] : [],
    });
  },
  component: LandingPage,
});

/** Where a card opens (a compound / project unit opens its compound or project). */
function cardPath(p: Property) {
  if (p.kind === "compound" && p.parentId) return `/compounds/${p.parentId}`;
  if (p.kind === "project" && p.parentId) return `/projects/${p.parentId}`;
  return `/properties/${p.id}`;
}

/** Questions people ask about this search, answered from the listings on the page. */
function faq(l: Landing, s: Stats): [string, string][] {
  const what = `${l.type.plural} ${l.purpose.label} في ${l.place.label}`;
  const out: [string, string][] = [];
  if (s.min) {
    out.push([`بكام ${what}؟`,
      `الأسعار المعروضة دلوقتي على فاليو عقار من ${egp(s.min)}${s.max > s.min ? ` لحد ${egp(s.max)}` : ""}${l.purpose.status === "إيجار" ? " في الشهر" : ""}، ونص العروض تحت ${egp(s.median)} تقريبًا${s.perMeter ? `، ومتوسط سعر المتر حوالي ${egp(s.perMeter)}` : ""}. الأرقام دي من ${s.count} عرض حقيقي على الموقع وبتتحدّث مع كل إعلان جديد.`]);
  }
  const where = [...s.places.slice(0, 6), ...s.areas.slice(0, 8)];
  if (where.length) out.push([`فين أماكن ${what}؟`, `العروض الحالية في: ${where.join("، ")}.`]);
  if (l.purpose.status === "بيع") {
    out.push([`ينفع أشتري بالتقسيط؟`, s.installments
      ? `أيوه، فيه ${s.installments} من العروض دي بالتقسيط أو كاش وتقسيط${s.assignments ? `، و${s.assignments} عرض تنازل عن عقد بالتقسيط` : ""}. التفاصيل (المقدم والقسط والمدة) في صفحة كل عقار.`
      : `أغلب العروض الحالية كاش. لو محتاج تقسيط، سيب طلبك وفريق فاليو عقار يدوّرلك على المناسب.`]);
  }
  out.push([`إزاي أتواصل مع صاحب العقار؟`, `افتح العقار اللي عاجبك وابعت استفسارك أو كلّمنا واتساب من نفس الصفحة. التواصل بيتم من خلال فاليو عقار، وفريقنا بيتابع معاك لحد المعاينة والتعاقد.`]);
  return out;
}

function LandingPage() {
  useLang();
  const { slug } = Route.useParams();
  const { list, stats: s, related } = Route.useLoaderData();
  const [all, setAll] = useState(false);
  const landing = findLanding(slug)!;
  const title = landingTitle(landing);
  return (
    <PageShell>
      <div className="mx-auto max-w-7xl px-4 py-8 md:px-6">
        <nav aria-label={t("مسار الصفحة")} className="text-sm text-muted-foreground">
          <a href="/" className="hover:text-primary">{t("الرئيسية")}</a> <span aria-hidden>‹</span> <a href="/real-estate" className="hover:text-primary">{t("ابحث حسب النوع")}</a>
        </nav>
        <h1 className="mt-2 text-2xl font-extrabold text-primary md:text-3xl">{title}</h1>
        {s.count ? (
          <p className="mt-3 max-w-3xl leading-relaxed text-muted-foreground">
            {`${s.count} عرض متاح دلوقتي`}
            {s.min ? ` بأسعار من ${egp(s.min)}${s.max > s.min ? ` لحد ${egp(s.max)}` : ""}${landing.purpose.status === "إيجار" ? " شهريًا" : ""}` : ""}
            {s.perMeter ? `، ومتوسط سعر المتر حوالي ${egp(s.perMeter)}` : ""}.
            {" "}{t("كل العروض بصور وأسعار حقيقية، والتواصل والمعاينة من خلال فاليو عقار.")}
          </p>
        ) : (
          <div className="mt-6 rounded-2xl border border-dashed bg-card p-6 text-center">
            <p className="font-bold text-primary">{t("لسه مفيش عروض متاحة هنا دلوقتي.")}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t("سيب طلبك ونبلّغك أول ما يتوفر اللي بتدوّر عليه.")}</p>
            <a href="/#request" className="mt-4 inline-flex h-11 items-center rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground">{t("اطلب عقارك")}</a>
          </div>
        )}

        {s.count > 0 && (
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {(all ? list : list.slice(0, FIRST)).map((p) => <PropertyCard key={`${p.kind ?? "p"}-${p.id}`} p={p} />)}
          </div>
        )}

        {s.count > FIRST && (
          <div className="mt-6 text-center">
            {!all && list.length > FIRST
              ? <button type="button" onClick={() => setAll(true)} className="inline-flex h-11 items-center rounded-xl border border-primary px-6 text-sm font-bold text-primary hover:bg-secondary">{t("عرض المزيد")}</button>
              : s.count > list.length && <a href="/#properties" className="text-sm font-bold text-teal hover:underline">{t("باقي العروض في البحث")} ←</a>}
          </div>
        )}

        {s.count > 0 && (
          <section className="mt-12 max-w-3xl">
            <h2 className="text-xl font-extrabold text-primary">{t("أسئلة شائعة")}</h2>
            <div className="mt-3 space-y-3">
              {faq(landing, s).map(([q, a]) => (
                <details key={q} className="rounded-2xl border bg-card p-4">
                  <summary className="cursor-pointer font-bold text-primary">{q}</summary>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{a}</p>
                </details>
              ))}
            </div>
          </section>
        )}

        <section className="mt-10 rounded-2xl bg-secondary p-5">
          <h2 className="font-extrabold text-primary">{t("مش لاقي اللي بتدوّر عليه؟")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("قولّنا عاوز إيه وميزانيتك كام، وفريقنا يدوّرلك. ولو عندك عقار، اعرضه على فاليو عقار ببلاش.")}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a href="/#request" className="inline-flex h-11 items-center rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground">{t("اطلب عقارك")}</a>
            <a href="/sell" className="inline-flex h-11 items-center rounded-xl border border-primary px-5 text-sm font-bold text-primary">{t("اعرض عقارك")}</a>
          </div>
        </section>

        {related.length > 0 && (
          <section className="mt-10">
            <h2 className="text-lg font-extrabold text-primary">{t("عمليات بحث قريبة")}</h2>
            <ul className="mt-3 flex flex-wrap gap-2">
              {related.map((r) => (
                <li key={r.slug}><a href={`/real-estate/${r.slug}`} className="inline-flex items-center gap-1.5 rounded-full border bg-card px-4 py-2 text-sm font-semibold text-primary hover:border-teal">{r.title}<span className="text-xs text-muted-foreground">({r.count})</span></a></li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </PageShell>
  );
}
