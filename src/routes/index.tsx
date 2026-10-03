import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Navbar, MobileBar } from "@/components/site/Navbar";
import { emptyFilters, type Filters } from "@/components/site/search";
import { Hero } from "@/components/site/Hero";
import { Categories, FeaturedProperties, RequestCTA, Brokers, BrokerServices, Footer } from "@/components/site/Sections";

export const Route = createFileRoute("/")({
  head: () => ({
    links: [{ rel: "canonical", href: "https://valueaqar.com/" }],
    scripts: [{ type: "application/ld+json", children: JSON.stringify({"@context":"https://schema.org","@graph":[{"@type":"RealEstateAgent","@id":"https://valueaqar.com/#org","name":"فاليو عقار","alternateName":"Value Aqar","url":"https://valueaqar.com/","telephone":"+201031958820","areaServed":"برج العرب الجديدة","sameAs":["https://www.facebook.com/share/19VhkpxBhr/","https://www.instagram.com/value._.square","https://www.tiktok.com/@value.square8"]},{"@type":"WebSite","name":"فاليو عقار","url":"https://valueaqar.com/","inLanguage":"ar"}]}) }],
    meta: [
      { title: "فاليو عقار | Value Aqar — عقارات برج العرب الجديدة" },
      { name: "description", content: "اكتشف شقق وفلل وأراضي ومحلات في برج العرب الجديدة، وتواصل مع الوسيط المناسب بسهولة." },
      { property: "og:title", content: "فاليو عقار | Value Aqar" },
      { property: "og:url", content: "https://valueaqar.com/" },
      { property: "og:description", content: "منصة عقارية لعرض العقارات وربط العملاء بالوسطاء في برج العرب الجديدة." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const [draft, setDraft] = useState<Filters>(emptyFilters);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const go = () => setTimeout(() => document.getElementById("properties")?.scrollIntoView({ behavior: "smooth" }), 0);
  const clear = () => { setDraft(emptyFilters); setFilters(emptyFilters); };
  const pick = (f: Partial<Filters>) => { const n = { ...emptyFilters, ...f }; setDraft(n); setFilters(n); go(); };
  return (
    <div className="min-h-screen">
      <Navbar />
      <main>
        <Hero draft={draft} setDraft={setDraft} onSearch={() => { setFilters(draft); go(); }} onClear={clear} />
        <Categories onPick={pick} />
        <FeaturedProperties filters={filters} onClear={clear} />
        <RequestCTA />
        <Brokers />
        <BrokerServices />
      </main>
      <Footer />
      <MobileBar />
    </div>
  );
}
