import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Navbar, MobileBar } from "@/components/site/Navbar";
import { emptyFilters, TYPE_GROUPS, type Filters } from "@/components/site/search";
import { Hero } from "@/components/site/Hero";
import { Categories, FeaturedProperties, RequestCTA, Brokers, BrokerServices, Footer } from "@/components/site/Sections";

export const Route = createFileRoute("/")({
  head: () => ({
    links: [{ rel: "canonical", href: "https://valueaqar.com/" }],
    scripts: [{ type: "application/ld+json", children: JSON.stringify({"@context":"https://schema.org","@graph":[{"@type":"RealEstateAgent","@id":"https://valueaqar.com/#org","name":"فاليو عقار","alternateName":"Value Aqar","url":"https://valueaqar.com/","telephone":"+201031958820","areaServed":["برج العرب","الساحل الشمالي"],"sameAs":["https://www.facebook.com/share/19VhkpxBhr/","https://www.instagram.com/value._.square","https://www.tiktok.com/@value.square8"]},{"@type":"WebSite","name":"فاليو عقار","url":"https://valueaqar.com/","inLanguage":"ar"}]}) }],
    meta: [
      { title: "فاليو عقار | عقارات برج العرب والساحل الشمالي للبيع والإيجار" },
      { name: "description", content: "اكتشف شقق وفلل وأراضي ومحلات في برج العرب والساحل الشمالي، وتواصل مع الوسيط المناسب بسهولة." },
      { property: "og:title", content: "فاليو عقار | عقارات برج العرب والساحل الشمالي للبيع والإيجار" },
      { property: "og:url", content: "https://valueaqar.com/" },
      { property: "og:description", content: "منصة عقارية لعرض العقارات وربط العملاء بالوسطاء في برج العرب والساحل الشمالي." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  validateSearch: (s: Record<string, unknown>): { cat?: string } =>
    typeof s["cat"] === "string" && s["cat"] in TYPE_GROUPS ? { cat: s["cat"] } : {},
  component: Index,
});

function Index() {
  const { cat } = Route.useSearch();
  const [draft, setDraft] = useState<Filters>(emptyFilters);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const go = () => setTimeout(() => document.getElementById("properties")?.scrollIntoView({ behavior: "smooth" }), 0);
  const clear = () => { setDraft(emptyFilters); setFilters(emptyFilters); };
  const pick = (f: Partial<Filters>) => { const n = { ...emptyFilters, ...f }; setDraft(n); setFilters(n); go(); };
  // Header category links land here as /?cat=residential
  useEffect(() => { if (cat) pick({ group: cat }); }, [cat]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="min-h-screen">
      <Navbar />
      <main>
        {/* A hero search by type replaces any category group picked before. */}
        <Hero draft={draft} setDraft={setDraft} onSearch={() => { setFilters(draft.type ? { ...draft, group: "" } : draft); go(); }} onClear={clear} />
        <FeaturedProperties filters={filters} onClear={clear} />
        <Categories onPick={pick} />
        <RequestCTA />
        <Brokers />
        <BrokerServices />
      </main>
      <Footer />
      <MobileBar />
    </div>
  );
}
