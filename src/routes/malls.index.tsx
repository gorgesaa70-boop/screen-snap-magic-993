import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Store, MapPin } from "lucide-react";
import { PageShell } from "@/components/site/ui";
import { fetchMalls } from "@/components/site/malls";
import { t, useLang } from "@/lib/i18n";

export const Route = createFileRoute("/malls/")({
  head: () => ({
    links: [{ rel: "canonical", href: "https://valueaqar.com/malls" }],
    meta: [
      { title: "المولات التجارية | فاليو عقار" },
      { name: "description", content: "تصفح المولات التجارية والوحدات المتاحة فيها للبيع والإيجار." },
      { property: "og:title", content: "المولات التجارية | فاليو عقار" },
      { property: "og:url", content: "https://valueaqar.com/malls" },
      { property: "og:description", content: "محلات ومكاتب داخل المولات للبيع والإيجار." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MallsPage,
});

function MallsPage() {
  useLang();
  const q = useQuery({ queryKey: ["malls"], queryFn: () => fetchMalls() });
  return (
    <PageShell>
      <section className="bg-primary px-4 py-8 text-primary-foreground md:px-6 md:py-12">
        <div className="mx-auto max-w-6xl">
          <h1 className="flex items-center gap-2 text-2xl font-extrabold md:text-4xl"><Store className="size-7 text-teal md:size-9" />{t("المولات التجارية")}</h1>
          <p className="mt-2 text-sm text-primary-foreground/80 md:text-base">{t("اختر المول لعرض الوحدات المتاحة للبيع أو الإيجار.")}</p>
        </div>
      </section>
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-4 px-4 pt-6 md:grid-cols-4 md:px-6">
        {q.isLoading && [1, 2].map((i) => <div key={i} className="h-44 animate-pulse rounded-2xl bg-muted" />)}
        {q.data?.length === 0 && <p className="col-span-full rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">{t("لا توجد مولات بعد.")}</p>}
        {q.data?.map((m) => (
          <Link key={m.id} to="/malls/$id" params={{ id: m.id }} className="rounded-2xl border bg-card p-4 text-center shadow-card transition hover:-translate-y-0.5">
            <div className="mx-auto grid size-24 place-items-center overflow-hidden rounded-2xl bg-secondary">
              {m.logo_url ? <img src={m.logo_url} alt={`لوجو ${m.name}`} className="size-full object-contain" /> : <Store className="size-10 text-teal" />}
            </div>
            <h2 className="mt-3 font-extrabold text-primary">{m.name}</h2>
            {m.location && <p className="mt-1 flex items-center justify-center gap-1 text-xs text-muted-foreground"><MapPin className="size-3.5" />{m.location}</p>}
          </Link>
        ))}
      </div>
    </PageShell>
  );
}
