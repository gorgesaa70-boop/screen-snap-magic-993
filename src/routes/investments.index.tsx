import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { TrendingUp, Plus, UserPlus } from "lucide-react";
import { PageShell, inputCls } from "@/components/site/ui";
import { CITY_NAMES, useLocations } from "@/components/site/data";
import { OpportunityCard } from "@/components/site/OpportunityCard";
import { OPP_KINDS, fetchOpportunities } from "@/lib/investments";
import { pageHead } from "@/lib/seo";
import { t, useLang } from "@/lib/i18n";

export const Route = createFileRoute("/investments/")({
  head: () => pageHead({
    path: "/investments",
    title: "فرص استثمارية في برج العرب والساحل الشمالي | فاليو عقار",
    description: "أراضي للتطوير، أنشطة قائمة للبيع، شراكات وحق انتفاع — فرص استثمارية بتراجعها فاليو عقار، والتفاصيل الكاملة بعد طلب المستثمر.",
  }),
  component: InvestmentsPage,
});

const BUDGETS: [string, number, number][] = [["أقل من 10 مليون", 0, 10e6], ["10 – 50 مليون", 10e6, 50e6], ["50 – 200 مليون", 50e6, 200e6], ["أكتر من 200 مليون", 200e6, Infinity]];

function InvestmentsPage() {
  useLocations();
  useLang();
  const q = useQuery({ queryKey: ["opportunities"], queryFn: fetchOpportunities });
  const [kind, setKind] = useState("");
  const [city, setCity] = useState("");
  const [budget, setBudget] = useState(-1);
  const rows = useMemo(() => (q.data ?? []).filter((o) => {
    if (kind && o.kind !== kind) return false;
    if (city && o.city !== city) return false;
    if (budget >= 0) {
      const [, lo, hi] = BUDGETS[budget]!;
      const min = Number(o.investment_min ?? o.investment_max ?? NaN), max = Number(o.investment_max ?? o.investment_min ?? NaN);
      if (!Number.isNaN(min) && (max < lo || min > hi)) return false;
    }
    return true;
  }), [q.data, kind, city, budget]);

  return (
    <PageShell>
      <section className="bg-primary px-4 py-8 text-primary-foreground md:px-6 md:py-12">
        <div className="mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-extrabold md:text-4xl"><TrendingUp className="size-7 text-teal md:size-9" />{t("فرص استثمارية")}</h1>
            <p className="mt-2 max-w-2xl text-sm text-primary-foreground/80 md:text-base">{t("أراضي للتطوير، أنشطة قائمة للبيع، شراكات وحق انتفاع. كل فرصة بتراجعها فاليو عقار، والتفاصيل الكاملة بتتبعت للمستثمر الجاد بعد طلبه.")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/investor" className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-teal px-4 text-sm font-bold text-accent-foreground hover:brightness-95"><UserPlus className="size-4" />{t("سجّل كمستثمر")}</Link>
            <Link to="/investments/new" className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-primary-foreground/30 px-4 text-sm font-bold hover:bg-primary-foreground/10"><Plus className="size-4" />{t("اعرض فرصة")}</Link>
          </div>
        </div>
      </section>
      <div className="mx-auto max-w-6xl px-4 pt-5 md:px-6">
        <div className="grid gap-2 sm:grid-cols-3">
          <select aria-label={t("نوع الفرصة")} className={inputCls} value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="">{t("كل الأنواع")}</option>{Object.entries(OPP_KINDS).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}
          </select>
          <select aria-label={t("المدينة")} className={inputCls} value={city} onChange={(e) => setCity(e.target.value)}>
            <option value="">{t("كل المدن")}</option>{CITY_NAMES.map((c) => <option key={c} value={c}>{t(c)}</option>)}
          </select>
          <select aria-label={t("حجم الاستثمار")} className={inputCls} value={budget} onChange={(e) => setBudget(Number(e.target.value))}>
            <option value={-1}>{t("أي حجم استثمار")}</option>{BUDGETS.map(([l], i) => <option key={l} value={i}>{t(l)}</option>)}
          </select>
        </div>
        {!q.isLoading && rows.length === 0 && (
          <p className="mt-4 rounded-2xl border border-dashed bg-card p-10 text-center text-sm text-muted-foreground">{t("مفيش فرص مطابقة دلوقتي — سجّل كمستثمر ونبعتلك أول ما تنزل فرصة تناسبك.")}</p>
        )}
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {q.isLoading && [1, 2, 3].map((i) => <div key={i} className="h-80 animate-pulse rounded-2xl bg-muted" />)}
          {rows.map((o) => <OpportunityCard key={o.id} o={o} />)}
        </div>
        <p className="mt-6 text-xs text-muted-foreground">{t("* الأرقام والعوائد تقديرية ومش ضمان. فاليو عقار بتراجع الفرص، لكن على المستثمر عمل الفحص القانوني والفني قبل أي تعاقد.")}</p>
      </div>
    </PageShell>
  );
}
