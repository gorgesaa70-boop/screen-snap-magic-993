import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { t, useLang } from "@/lib/i18n";
import { pageHead, breadcrumbs, unavailableHead, SITE_NAME } from "@/lib/seo";
import { PageShell, inputCls } from "@/components/site/ui";
import { cityOfArea, FINISHING_LABEL } from "@/components/site/data";
import { fetchMalls } from "@/components/site/malls";
import { FINISHING_KEYS, fetchFinishingRatios, fetchPriceIndex, series, DEFAULT_RATIOS } from "@/components/site/prices";
import { DistrictTable, PriceCalculator, TrendChart } from "@/components/site/PriceTools";

const RES_TYPES = ["شقة", "بيت", "عمارة", "فيلا", "دوبلكس", "أرض"];

export const Route = createFileRoute("/prices/areas/$area")({
  loader: ({ context }) => context.queryClient.ensureQueryData({ queryKey: ["price-index"], queryFn: fetchPriceIndex }).catch(() => []),
  head: ({ params, loaderData }) => {
    const area = params.area;
    const path = `/prices/areas/${encodeURIComponent(area)}`;
    const city = cityOfArea(area);
    if (!city) return unavailableHead(path, "المنطقة غير معروفة");
    const place = area === city ? city : `${area} ${city}`;
    return pageHead({
      path,
      title: `أسعار الشقق والبيوت والأراضي في ${place} 2026 — سعر المتر | ${SITE_NAME}`,
      description: `سعر متر الشقق والبيوت والأراضي في ${place} حسب التشطيب (عمدان، نص تشطيب، تشطيب كامل)، وإيجار المتر، من عقارات حقيقية على فاليو عقار.`,
      noindex: !(loaderData ?? []).some((r) => r.area === area && r.month === null),
      jsonLd: [breadcrumbs([{ name: "الرئيسية", path: "/" }, { name: "الأسعار", path: "/prices" }, { name: place, path }])],
    });
  },
  component: AreaPrices,
});

function AreaPrices() {
  useLang();
  const { area } = Route.useParams();
  const idx = useQuery({ queryKey: ["price-index"], queryFn: fetchPriceIndex, initialData: Route.useLoaderData(), staleTime: 60 * 60_000 });
  const malls = useQuery({ queryKey: ["malls"], queryFn: () => fetchMalls() });
  const ratios = useQuery({ queryKey: ["finishing-ratios"], queryFn: fetchFinishingRatios, staleTime: 60 * 60_000 });
  const [resType, setResType] = useState("شقة");
  const [fin, setFin] = useState<string>("full");
  const city = cityOfArea(area);
  const rows = idx.data ?? [];
  if (!city) return <PageShell><div className="mx-auto max-w-md p-10 text-center"><p className="font-bold text-primary">{t("المنطقة غير معروفة")}</p><a href="/prices" className="mt-4 inline-block font-bold text-primary underline">{t("كل الأسعار")}</a></div></PageShell>;
  const trend = series(rows, { kind: "residential", purpose: "sale", area, unit_type: resType, finishing: resType === "أرض" ? null : fin });
  return (
    <PageShell>
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 md:px-6">
        <div>
          <a href="/prices" className="text-sm font-bold text-primary hover:text-teal">{t("→ كل الأسعار")}</a>
          <h1 className="mt-2 text-2xl font-extrabold text-primary md:text-3xl">{t("أسعار")} {t(area)}{area !== city ? `، ${t(city)}` : ""}</h1>
        </div>
        <section className="rounded-2xl border bg-card p-5">
          <select aria-label={t("نوع العقار")} className={`${inputCls} mb-3 sm:w-64`} value={resType} onChange={(e) => setResType(e.target.value)}>{RES_TYPES.map((r) => <option key={r} value={r}>{t(r)}</option>)}</select>
          <DistrictTable rows={rows.filter((r) => r.area === area)} city={city} unitType={resType} />
        </section>
        <section className="rounded-2xl border bg-card p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-extrabold text-primary">{t("سعر متر البيع شهر بشهر")}</h2>
            {resType !== "أرض" && <select aria-label={t("حالة التشطيب")} className={`${inputCls} w-auto`} value={fin} onChange={(e) => setFin(e.target.value)}>{FINISHING_KEYS.map((f) => <option key={f} value={f}>{t(FINISHING_LABEL[f]!)}</option>)}</select>}
          </div>
          {trend.length >= 2 ? <TrendChart data={trend} /> : <p className="text-sm text-muted-foreground">{t("الرسم بيظهر لما يبقى فيه أسعار لشهرين على الأقل.")}</p>}
        </section>
        {malls.data && <PriceCalculator rows={rows} ratios={ratios.data ?? DEFAULT_RATIOS} malls={malls.data} preset={{ kind: "residential", area }} />}
      </div>
    </PageShell>
  );
}
