import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { formatPrice } from "@/components/site/data";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Store, MapPin } from "lucide-react";
import { PageShell } from "@/components/site/ui";
import { MALL_KINDS, fetchMalls } from "@/components/site/malls";
import { isAvailable } from "@/components/site/availability";
import { useState } from "react";
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
  // Available units per mall, shown on each card.
  const units = useQuery({
    queryKey: ["mall-unit-counts"],
    queryFn: async () => {
      const rows = await fetchAll((a, b) => supabase.from("properties").select("*").eq("category", "mall").eq("review_status", "approved").order("id").range(a, b)).then((all) => all.filter(isAvailable));
      const m = new Map<string, number>();
      rows.forEach((r) => { if (r.mall_id) m.set(r.mall_id, (m.get(r.mall_id) ?? 0) + 1); });
      return m;
    },
  });
  const [kind, setKind] = useState("");
  const kinds = [...new Set((q.data ?? []).map((m) => m.kind))];
  const malls = (q.data ?? []).filter((m) => !kind || m.kind === kind);
  return (
    <PageShell>
      <section className="bg-primary px-4 py-8 text-primary-foreground md:px-6 md:py-12">
        <div className="mx-auto max-w-6xl">
          <h1 className="flex items-center gap-2 text-2xl font-extrabold md:text-4xl"><Store className="size-7 text-teal md:size-9" />{t("المولات التجارية")}</h1>
          <p className="mt-2 text-sm text-primary-foreground/80 md:text-base">{t("اختار المول وشوف الوحدات المتاحة للبيع أو الإيجار.")}</p>
        </div>
      </section>
      {kinds.length > 1 && (
        <div className="mx-auto flex max-w-6xl flex-wrap gap-2 px-4 pt-5 md:px-6" role="group" aria-label={t("نوع المول")}>
          {[["", "كل المولات"], ...kinds.map((k) => [k, k === "medical" ? "مولات طبية" : `${t("مولات")} ${t(MALL_KINDS[k] ?? k)}`])].map(([k, l]) => (
            <button key={k} onClick={() => setKind(k!)} aria-pressed={kind === k} className={`h-10 rounded-full border px-4 text-sm font-bold ${kind === k ? "border-primary bg-primary text-primary-foreground" : "bg-card text-primary hover:border-teal"}`}>{t(l!)}</button>
          ))}
        </div>
      )}
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-4 px-4 pt-6 md:grid-cols-4 md:px-6">
        {q.isLoading && [1, 2].map((i) => <div key={i} className="h-44 animate-pulse rounded-2xl bg-muted" />)}
        {q.isError && <p className="col-span-full rounded-2xl bg-destructive/10 p-4 text-sm text-destructive">{t("المولات ماحمّلتش، حدّث الصفحة.")}</p>}
        {q.data?.length === 0 && <p className="col-span-full rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">{t("لسه مفيش مولات منشورة.")} <a href="/#request" className="font-bold text-teal">{t("اطلب محل أو وحدة")}</a></p>}
        {malls.map((m) => (
          <Link key={m.id} to="/malls/$id" params={{ id: m.id }} className="rounded-2xl border bg-card p-4 text-center shadow-card transition hover:-translate-y-0.5">
            <div className="mx-auto grid size-24 place-items-center overflow-hidden rounded-2xl bg-secondary">
              {m.logo_url ? <img src={m.logo_url} alt={m.name} className="size-full object-cover" /> : <Store className="size-10 text-teal" />}
            </div>
            <h2 className="mt-3 font-extrabold text-primary">{m.name}</h2>
            {units.data && <p className={`mt-0.5 text-xs font-bold ${units.data.get(m.id) ? "text-teal" : "text-muted-foreground"}`}>{units.data.get(m.id) ? `${formatPrice(units.data.get(m.id)!)} ${t("وحدة متاحة")}` : t("قريبًا")}</p>}
            {m.kind !== "commercial" && <span className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold ${m.kind === "medical" ? "bg-teal-soft text-primary" : "bg-secondary text-primary"}`}>{m.kind === "medical" ? "⚕ " : ""}{t(MALL_KINDS[m.kind] ?? m.kind)}</span>}
            {m.location && <p className="mt-1 flex items-center justify-center gap-1 text-xs text-muted-foreground"><MapPin className="size-3.5" />{m.location}</p>}
          </Link>
        ))}
      </div>
    </PageShell>
  );
}
