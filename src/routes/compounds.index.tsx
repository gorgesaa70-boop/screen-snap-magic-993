import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { formatPrice } from "@/components/site/data";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Building2, MapPin } from "lucide-react";
import { PageShell } from "@/components/site/ui";
import { fetchCompounds } from "@/components/site/compounds";
import { t, useLang } from "@/lib/i18n";

export const Route = createFileRoute("/compounds/")({
  head: () => ({
    links: [{ rel: "canonical", href: "https://valueaqar.com/compounds" }],
    meta: [
      { title: "الكمبوندات السكنية | فاليو عقار" },
      { name: "description", content: "تصفح الكمبوندات السكنية والوحدات المتاحة فيها للبيع والإيجار والمصيف." },
      { property: "og:title", content: "الكمبوندات السكنية | فاليو عقار" },
      { property: "og:url", content: "https://valueaqar.com/compounds" },
      { property: "og:description", content: "شقق وفيلات وشاليهات داخل الكمبوندات السكنية للبيع والإيجار." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CompoundsPage,
});

function CompoundsPage() {
  useLang();
  const q = useQuery({ queryKey: ["compounds"], queryFn: () => fetchCompounds() });
  // Available units per compound, shown on each card.
  const units = useQuery({
    queryKey: ["compound-unit-counts"],
    queryFn: async () => {
      const rows = await fetchAll((a, b) => supabase.from("properties").select("id, compound_id").eq("review_status", "approved").not("compound_id", "is", null).order("id").range(a, b));
      const m = new Map<string, number>();
      rows.forEach((r) => { if (r.compound_id) m.set(r.compound_id, (m.get(r.compound_id) ?? 0) + 1); });
      return m;
    },
  });
  return (
    <PageShell>
      <section className="bg-primary px-4 py-8 text-primary-foreground md:px-6 md:py-12">
        <div className="mx-auto max-w-6xl">
          <h1 className="flex items-center gap-2 text-2xl font-extrabold md:text-4xl"><Building2 className="size-7 text-teal md:size-9" />{t("الكمبوندات السكنية")}</h1>
          <p className="mt-2 text-sm text-primary-foreground/80 md:text-base">{t("اختار الكمبوند وشوف الوحدات المتاحة للبيع أو الإيجار.")}</p>
        </div>
      </section>
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-4 px-4 pt-6 md:grid-cols-4 md:px-6">
        {q.isLoading && [1, 2].map((i) => <div key={i} className="h-44 animate-pulse rounded-2xl bg-muted" />)}
        {q.isError && <p className="col-span-full rounded-2xl bg-destructive/10 p-4 text-sm text-destructive">{t("الكمبوندات ماحمّلتش، حدّث الصفحة.")}</p>}
        {q.data?.length === 0 && <p className="col-span-full rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">{t("لسه مفيش كمبوندات منشورة.")} <a href="/#request" className="font-bold text-teal">{t("اطلب وحدة في كمبوند")}</a></p>}
        {q.data?.map((c) => (
          <Link key={c.id} to="/compounds/$id" params={{ id: c.id }} className="rounded-2xl border bg-card p-4 text-center shadow-card transition hover:-translate-y-0.5">
            <div className="mx-auto grid size-24 place-items-center overflow-hidden rounded-2xl bg-secondary">
              {c.logo_url ? <img src={c.logo_url} alt={c.name} className="size-full object-cover" /> : <Building2 className="size-10 text-teal" />}
            </div>
            <h2 className="mt-3 font-extrabold text-primary">{c.name}</h2>
            {units.data && <p className={`mt-0.5 text-xs font-bold ${units.data.get(c.id) ? "text-teal" : "text-muted-foreground"}`}>{units.data.get(c.id) ? `${formatPrice(units.data.get(c.id)!)} ${t("وحدة متاحة")}` : t("قريبًا")}</p>}
            {c.location && <p className="mt-1 flex items-center justify-center gap-1 text-xs text-muted-foreground"><MapPin className="size-3.5" />{c.location}</p>}
          </Link>
        ))}
      </div>
    </PageShell>
  );
}
