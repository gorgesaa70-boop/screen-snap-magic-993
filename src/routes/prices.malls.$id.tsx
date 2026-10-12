import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { t, useLang } from "@/lib/i18n";
import { pageHead, breadcrumbs, unavailableHead, SITE_NAME } from "@/lib/seo";
import { PageShell, inputCls } from "@/components/site/ui";
import { MALL_UNIT_TYPES, fetchMalls } from "@/components/site/malls";
import { FLOOR_LABEL, fetchFinishingRatios, fetchPriceIndex, series, current, DEFAULT_RATIOS } from "@/components/site/prices";
import { MallFloors, PriceCalculator, TrendChart } from "@/components/site/PriceTools";

async function load(id: string) {
  const [{ data: mall }, rows] = await Promise.all([
    supabase.from("malls").select("id, name, description").eq("id", id).eq("is_active", true).maybeSingle(),
    fetchPriceIndex().catch(() => []),
  ]);
  return mall ? { mall, rows } : null;
}

export const Route = createFileRoute("/prices/malls/$id")({
  loader: ({ params, context }) => context.queryClient.ensureQueryData({ queryKey: ["mall-prices", params.id], queryFn: () => load(params.id) }),
  head: ({ params, loaderData }) => {
    const path = `/prices/malls/${params.id}`;
    if (!loaderData) return unavailableHead(path, "المول غير متاح");
    const { mall, rows } = loaderData;
    const ground = current(rows, { kind: "mall", purpose: "sale", mall_id: mall.id, floor_level: 0, unit_type: null });
    return pageHead({
      path,
      title: `أسعار المحلات والعيادات في ${mall.name} برج العرب 2026 — سعر المتر لكل دور | ${SITE_NAME}`,
      description: `سعر متر البيع والإيجار في ${mall.name} لكل دور (الأرضي والأول تجاري، التاني والتالت إداري وطبي)، والعائد السنوي${ground ? `. الأرضي حوالي ${Math.round(ground.price_per_m2).toLocaleString("en-US")} ج.م للمتر` : ""}.`,
      noindex: !rows.some((r) => r.mall_id === mall.id && r.month === null),
      jsonLd: [breadcrumbs([{ name: "الرئيسية", path: "/" }, { name: "الأسعار", path: "/prices" }, { name: mall.name, path }])],
    });
  },
  component: MallPrices,
});

function MallPrices() {
  useLang();
  const { id } = Route.useParams();
  const initial = Route.useLoaderData();
  const q = useQuery({ queryKey: ["mall-prices", id], queryFn: () => load(id), initialData: initial });
  const malls = useQuery({ queryKey: ["malls"], queryFn: () => fetchMalls() });
  const ratios = useQuery({ queryKey: ["finishing-ratios"], queryFn: fetchFinishingRatios, staleTime: 60 * 60_000 });
  const [unitType, setUnitType] = useState("");
  const [floor, setFloor] = useState(0);
  if (!q.data) return <PageShell><div className="mx-auto max-w-md p-10 text-center"><p className="font-bold text-primary">{t("المول غير متاح")}</p><a href="/prices" className="mt-4 inline-block font-bold text-primary underline">{t("كل الأسعار")}</a></div></PageShell>;
  const { mall, rows } = q.data;
  const trend = series(rows, { kind: "mall", purpose: "sale", mall_id: mall.id, floor_level: floor, unit_type: unitType || null });
  return (
    <PageShell>
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 md:px-6">
        <div>
          <a href="/prices" className="text-sm font-bold text-primary hover:text-teal">{t("→ كل الأسعار")}</a>
          <h1 className="mt-2 text-2xl font-extrabold text-primary md:text-3xl">{t("أسعار")} {mall.name}</h1>
          <a href={`/malls/${mall.id}`} className="mt-1 inline-block text-sm font-bold text-teal">{t("شوف الوحدات المتاحة في المول ←")}</a>
        </div>
        <section className="rounded-2xl border bg-card p-5">
          <select aria-label={t("نوع الوحدة")} className={`${inputCls} mb-3 sm:w-64`} value={unitType} onChange={(e) => setUnitType(e.target.value)}>
            <option value="">{t("كل أنواع الوحدات")}</option>{MALL_UNIT_TYPES.map((u) => <option key={u} value={u}>{t(u)}</option>)}
          </select>
          <MallFloors rows={rows} mallId={mall.id} unitType={unitType || null} />
        </section>
        <section className="rounded-2xl border bg-card p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-extrabold text-primary">{t("سعر متر البيع شهر بشهر")}</h2>
            <select aria-label={t("الدور")} className={`${inputCls} w-auto`} value={floor} onChange={(e) => setFloor(Number(e.target.value))}>{FLOOR_LABEL.map((f, i) => <option key={f} value={i}>{t(f)}</option>)}</select>
          </div>
          {trend.length >= 2 ? <TrendChart data={trend} /> : <p className="text-sm text-muted-foreground">{t("الرسم بيظهر لما يبقى فيه أسعار لشهرين على الأقل.")}</p>}
        </section>
        {malls.data && <PriceCalculator rows={rows} ratios={ratios.data ?? DEFAULT_RATIOS} malls={malls.data} preset={{ kind: "mall", mallId: mall.id }} />}
      </div>
    </PageShell>
  );
}
