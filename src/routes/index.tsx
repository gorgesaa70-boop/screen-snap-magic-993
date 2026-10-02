import { createFileRoute } from "@tanstack/react-router";
import { Navbar } from "@/components/site/Navbar";
import { Hero } from "@/components/site/Hero";
import { Categories, FeaturedProperties, RequestCTA, Brokers, BrokerServices, Footer } from "@/components/site/Sections";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "فاليو عقار | Value Aqar — عقارات برج العرب الجديدة" },
      { name: "description", content: "اكتشف شقق وفلل وأراضي ومحلات في برج العرب الجديدة، وتواصل مع الوسيط المناسب بسهولة." },
      { property: "og:title", content: "فاليو عقار | Value Aqar" },
      { property: "og:description", content: "منصة عقارية لعرض العقارات وربط العملاء بالوسطاء في برج العرب الجديدة." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="min-h-screen">
      <Navbar />
      <main>
        <Hero />
        <Categories />
        <FeaturedProperties />
        <RequestCTA />
        <Brokers />
        <BrokerServices />
      </main>
      <Footer />
    </div>
  );
}
