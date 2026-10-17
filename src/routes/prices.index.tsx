import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { TrendingUp } from "lucide-react";
import { t, useLang } from "@/lib/i18n";
import { pageHead, breadcrumbs } from "@/lib/seo";
import { PageShell, inputCls, btnPrimary } from "@/components/site/ui";
import { CITY_NAMES, useLocations } from "@/components/site/data";
import { MALL_UNIT_TYPES, fetchMalls } from "@/components/site/malls";
import { fetchFinishingRatios, fetchPriceIndex, hasData, mallIdsWithData, DEFAULT_RATIOS } from "@/components/site/prices";
import { DistrictTable, MallFloors, PriceCalculator } from "@/components/site/PriceTools";

const RES_TYPES = ["شقة", "بيت", "عمارة", "فيلا", "دوبلكس", "أرض"];

export const Route = createFileRoute("/prices/")({
  loader: ({ context }) => context.queryClient.ensureQueryData({ queryKey: ["price-index"], queryFn: fetchPriceIndex }).catch(() => []),
  head: () => pageHead({
    path: "/prices",
    title: "أسعار المولات والعقارات في برج العرب 2026 — سعر المتر | فاليو عقار",
    description: "سعر متر المحلات والعيادات والمكاتب في مولات برج العرب لكل دور، وإيجار المتر والعائد السنوي، وأسعار الشقق والبيوت والأراضي في كل حي حسب التشطيب. أرقام من وحدات حقيقية على فاليو عقار.",
    jsonLd: [breadcrumbs([{ name: "الرئيسية", path: "/" }, { name: "الأسعار", path: "/prices" }])],
  }),
  component: PricesPage,
});

function PricesPage() {
  useLocations();
  useLang();
  const idx = useQuery({ queryKey: ["price-index"], queryFn: fetchPriceIndex, staleTime: 60 * 60_000 });
  const malls = useQuery({ queryKey: ["malls"], queryFn: () => fetchMalls() });
  const ratios = useQuery({ queryKey: ["finishing-ratios"], queryFn: fetchFinishingRatios, staleTime: 60 * 60_000 });
  const rows = idx.data ?? [];
  const [tab, setTab] = useState<"malls" | "homes">("malls");
  const [unitType, setUnitType] = useState("");
  const [compare, setCompare] = useState<[string, string]>(["", ""]);
  const [city, setCity] = useState(CITY_NAMES[0]!);
  const [resType, setResType] = useState("شقة");
  const withData = mallIdsWithData(rows);
  const mallList = (malls.data ?? []).filter((m) => withData.includes(m.id));
  const nameOf = (id: string) => malls.data?.find((m) => m.id === id)?.name ?? "";

  return (
    <PageShell>
      <section className="bg-primary">
        <div className="mx-auto max-w-6xl px-4 py-10 md:px-6 md:py-14">
          <p className="flex items-center gap-1.5 text-sm font-bold text-teal"><TrendingUp className="size-4" />{t("مؤشر فاليو عقار")}</p>
          <h1 className="mt-2 text-2xl font-extrabold text-primary-foreground md:text-4xl">{t("أسعار المولات والعقارات في برج العرب")}</h1>
          <p className="mt-3 max-w-2xl text-sm text-primary-foreground/80 md:text-base">{t("سعر المتر الحقيقي من الوحدات المعروضة والصفقات اللي اتقفلت على المنصة في آخر 12 شهر — السعر الوسطاني، ومحتاج 3 وحدات على الأقل عشان يظهر.")}</p>
        </div>
      </section>

      <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 md:px-6">
        {idx.isLoading ? <div className="h-60 animate-pulse rounded-2xl bg-muted" /> : !hasData(rows) ? (
          <div className="rounded-2xl border border-dashed bg-card p-8 text-center">
            <p className="text-lg font-bold text-primary">{t("بنجمّع الأسعار دلوقتي")}</p>
            <p className="mt-2 text-sm text-muted-foreground">{t("أول ما الوحدات المعروضة تكفي، الأسعار هتظهر هنا لوحدها. عندك وحدة؟ اعرضها ببلاش.")}</p>
            <a href="/sell" className={`${btnPrimary} mt-5`}>{t("اعرض وحدتك")}</a>
          </div>
        ) : (<>
          <div className="grid grid-cols-2 gap-1.5 sm:max-w-sm" role="tablist">
            {(["malls", "homes"] as const).map((k) => (
              <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                className={`h-11 rounded-xl border text-sm font-bold ${tab === k ? "border-primary bg-primary text-primary-foreground" : "bg-card text-primary"}`}>{t(k === "malls" ? "المولات" : "شقق وبيوت وأراضي")}</button>
            ))}
          </div>

          {tab === "malls" ? (<>
            <select aria-label={t("نوع الوحدة")} className={`${inputCls} sm:w-64`} value={unitType} onChange={(e) => setUnitType(e.target.value)}>
              <option value="">{t("كل أنواع الوحدات")}</option>{MALL_UNIT_TYPES.map((u) => <option key={u} value={u}>{t(u)}</option>)}
            </select>
            {mallList.length === 0 ? <p className="text-sm text-muted-foreground">{t("لسه مفيش وحدات كفاية في المولات.")}</p> : mallList.map((m) => (
              <section key={m.id} className="rounded-2xl border bg-card p-5">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h2 className="text-lg font-extrabold text-primary">{m.name}</h2>
                  <a href={`/prices/malls/${m.id}`} className="text-sm font-bold text-primary hover:text-teal">{t("التفاصيل والاتجاه ←")}</a>
                </div>
                <MallFloors rows={rows} mallId={m.id} unitType={unitType || null} />
              </section>
            ))}
            {mallList.length >= 2 && (
              <section className="rounded-2xl border bg-card p-5">
                <h2 className="text-lg font-extrabold text-primary">{t("قارن مولين")}</h2>
                <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
                  {[0, 1].map((i) => (
                    <select key={i} aria-label={t("المول")} className={inputCls} value={compare[i]} onChange={(e) => setCompare(i === 0 ? [e.target.value, compare[1]] : [compare[0], e.target.value])}>
                      <option value="">{t("اختار مول")}</option>{mallList.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                  ))}
                </div>
                <div className="mt-4 grid gap-5 lg:grid-cols-2">
                  {compare.filter(Boolean).map((id) => <div key={id}><p className="mb-2 font-bold text-primary">{nameOf(id)}</p><MallFloors rows={rows} mallId={id} unitType={unitType || null} /></div>)}
                </div>
              </section>
            )}
          </>) : (
            <section className="rounded-2xl border bg-card p-5">
              <div className="mb-4 grid gap-2.5 sm:grid-cols-2 sm:max-w-lg">
                <select aria-label={t("المدينة")} className={inputCls} value={city} onChange={(e) => setCity(e.target.value)}>{CITY_NAMES.map((c) => <option key={c} value={c}>{t(c)}</option>)}</select>
                <select aria-label={t("نوع العقار")} className={inputCls} value={resType} onChange={(e) => setResType(e.target.value)}>{RES_TYPES.map((r) => <option key={r} value={r}>{t(r)}</option>)}</select>
              </div>
              <DistrictTable rows={rows} city={city} unitType={resType} />
            </section>
          )}
        </>)}

        {(malls.data?.length ?? 0) > 0 && <PriceCalculator rows={rows} ratios={ratios.data ?? DEFAULT_RATIOS} malls={malls.data!} />}
        <p className="text-xs text-muted-foreground">{t("* الأرقام تقديرية من الإعلانات والصفقات على فاليو عقار، ومش تقييم رسمي.")}</p>
      </div>
    </PageShell>
  );
}
