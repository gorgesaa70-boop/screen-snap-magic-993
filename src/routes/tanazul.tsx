import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeftRight, FileSearch, HandCoins, ShieldCheck } from "lucide-react";
import { t, useLang } from "@/lib/i18n";
import { pageHead, breadcrumbs } from "@/lib/seo";
import { PageShell, btnTeal, btnOutline } from "@/components/site/ui";
import { fetchPublicProperties } from "@/components/site/data";
import { PropertyCard } from "@/components/site/Sections";

export const Route = createFileRoute("/tanazul")({
  head: () => pageHead({
    path: "/tanazul",
    title: "وحدات تنازل بالتقسيط في العلمين والساحل وبرج العرب | فاليو عقار",
    description: "وحدات بالتقسيط أصحابها عايزين يتنازلوا عنها: ادفع مبلغ التنازل وكمّل الأقساط مع المطور. كل عقد بيتراجع من فريق فاليو عقار، والتواصل من خلال المنصة بس.",
    jsonLd: [breadcrumbs([{ name: "الرئيسية", path: "/" }, { name: "تنازل", path: "/tanazul" }])],
  }),
  component: Tanazul,
});

/** «تنازل»: installment units their owners want to hand over, with the contract numbers on every card. */
function Tanazul() {
  useLang();
  const q = useQuery({ queryKey: ["public-properties"], queryFn: () => fetchPublicProperties() });
  const list = (q.data ?? []).filter((p) => p.assignment);
  const steps = [
    { I: FileSearch, l: "اختار وحدة وشوف سعر العقد واللي اتدفع والباقي" },
    { I: HandCoins, l: "تدفع مبلغ التنازل للبايع، وتكمّل الأقساط مع المطور" },
    { I: ShieldCheck, l: "فريق فاليو عقار بيراجع العقد ويمشي معاك لحد التنازل" },
  ];
  return (
    <PageShell>
      <section className="bg-primary">
        <div className="mx-auto max-w-6xl px-4 py-10 md:px-6 md:py-14">
          <h1 className="flex items-center gap-2 text-2xl font-extrabold text-primary-foreground md:text-4xl"><ArrowLeftRight className="size-7 text-[#e76f51]" />{t("وحدات تنازل")}</h1>
          <p className="mt-3 max-w-2xl text-sm text-primary-foreground/80 md:text-base">{t("وحدات لسه بالتقسيط، وأصحابها عايزين حد يكمّل مكانهم. بتدفع مبلغ التنازل بس، وتكمّل باقي الأقساط بنفس سعر العقد القديم.")}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <a href="/sell?asg=1" className={btnTeal}>{t("اعرض وحدتك للتنازل")}</a>
            <Link to="/wanted" className={`${btnOutline} border-primary-foreground/40 text-primary-foreground hover:bg-primary-foreground/10`}>{t("مش لاقي؟ اكتب طلبك")}</Link>
          </div>
        </div>
      </section>
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 md:px-6">
        <ol className="grid gap-3 sm:grid-cols-3">
          {steps.map(({ I, l }, i) => (
            <li key={l} className="flex items-start gap-3 rounded-2xl border bg-card p-4"><span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#e76f51]/15 font-extrabold text-[#e76f51]">{i + 1}</span><span className="flex items-start gap-1.5 text-sm font-semibold text-primary"><I className="mt-0.5 size-4 shrink-0 text-teal" />{t(l)}</span></li>
          ))}
        </ol>
        {q.isLoading ? <div className="h-40 animate-pulse rounded-2xl bg-muted" />
          : list.length === 0 ? (
            <div className="rounded-2xl border border-dashed bg-card p-10 text-center">
              <ArrowLeftRight className="mx-auto size-10 text-[#e76f51]" />
              <p className="mt-3 font-bold text-primary">{t("لسه مفيش وحدات تنازل")}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t("عندك وحدة بالتقسيط وعايز تتنازل عنها؟ اعرضها دلوقتي.")}</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{list.map((p) => <PropertyCard key={p.id} p={p} />)}</div>
          )}
      </div>
    </PageShell>
  );
}
