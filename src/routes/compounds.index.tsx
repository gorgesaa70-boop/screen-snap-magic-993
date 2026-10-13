import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Building2, MapPin, SlidersHorizontal, CalendarClock, Wallet, X } from "lucide-react";
import { PageShell, inputCls, btnOutline } from "@/components/site/ui";
import { formatPrice } from "@/components/site/data";
import {
  AMENITIES, UNIT_TYPES, EMPTY_COMPOUND_FILTERS, compoundCover, compoundWhere, developerLabel, fetchCompoundCards, filterCompounds,
  isReady, matchingUnits, startingPrice, type CompoundFilters,
} from "@/components/site/compounds";
import { pageHead } from "@/lib/seo";
import { t, useLang } from "@/lib/i18n";

export const Route = createFileRoute("/compounds/")({
  head: () => pageHead({
    path: "/compounds",
    title: "الكمبوندات السكنية – الوحدات والأسعار وأنظمة التقسيط | فاليو عقار",
    description: "تصفح الكمبوندات السكنية في برج العرب والساحل الشمالي: الوحدات المتاحة، الأسعار، المقدم وسنين التقسيط، وميعاد الاستلام.",
  }),
  component: CompoundsPage,
});

function CompoundsPage() {
  useLang();
  const q = useQuery({ queryKey: ["compound-cards"], queryFn: fetchCompoundCards });
  const [f, setF] = useState<CompoundFilters>(EMPTY_COMPOUND_FILTERS);
  const [more, setMore] = useState(false);
  const all = useMemo(() => q.data ?? [], [q.data]);
  const areas = useMemo(() => [...new Set(all.map((c) => c.area).filter((a): a is string => !!a))].sort(), [all]);
  const developers = useMemo(() => [...new Set(all.map((c) => developerLabel(c, c.developer)).filter((d): d is string => !!d))].sort(), [all]);
  const types = useMemo(() => UNIT_TYPES.filter((ty) => all.some((c) => c.compound_units.some((u) => u.unit_type === ty))), [all]);
  const rows = useMemo(() => filterCompounds(all, f), [all, f]);
  const year = new Date().getFullYear();
  const set = <K extends keyof CompoundFilters>(k: K, v: CompoundFilters[K]) => setF((x) => ({ ...x, [k]: v }));
  const digits = (k: keyof CompoundFilters) => (e: React.ChangeEvent<HTMLInputElement>) => set(k, e.target.value.replace(/\D/g, "") as never);
  const active = JSON.stringify(f) !== JSON.stringify(EMPTY_COMPOUND_FILTERS);

  return (
    <PageShell>
      <section className="bg-primary px-4 py-8 text-primary-foreground md:px-6 md:py-12">
        <div className="mx-auto max-w-6xl">
          <h1 className="flex items-center gap-2 text-2xl font-extrabold md:text-4xl"><Building2 className="size-7 text-teal md:size-9" />{t("الكمبوندات السكنية")}</h1>
          <p className="mt-2 text-sm text-primary-foreground/80 md:text-base">{t("قارن الكمبوندات بالسعر والمقدم وسنين التقسيط وميعاد الاستلام، وشوف الوحدات المتاحة.")}</p>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 pt-5 md:px-6">
        <div className="rounded-2xl border bg-card p-3 md:p-4">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <select aria-label={t("المنطقة")} className={inputCls} value={f.area} onChange={(e) => set("area", e.target.value)}>
              <option value="">{t("كل المناطق")}</option>{areas.map((a) => <option key={a} value={a}>{t(a)}</option>)}
            </select>
            <select aria-label={t("نوع الوحدة")} className={inputCls} value={f.type} onChange={(e) => set("type", e.target.value)}>
              <option value="">{t("كل الأنواع")}</option>{types.map((ty) => <option key={ty} value={ty}>{t(ty)}</option>)}
            </select>
            <input aria-label={t("السعر من")} className={inputCls} inputMode="numeric" placeholder={t("السعر من")} value={f.minPrice} onChange={digits("minPrice")} />
            <input aria-label={t("السعر إلى")} className={inputCls} inputMode="numeric" placeholder={t("السعر إلى")} value={f.maxPrice} onChange={digits("maxPrice")} />
          </div>
          {more && (
            <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
              <select aria-label={t("المطور")} className={inputCls} value={f.developer} onChange={(e) => set("developer", e.target.value)}>
                <option value="">{t("كل المطورين")}</option>{developers.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
              <select aria-label={t("الاستلام")} className={inputCls} value={f.delivery} onChange={(e) => set("delivery", e.target.value)}>
                <option value="">{t("أي ميعاد استلام")}</option>
                <option value="ready">{t("استلام فوري")}</option>
                {[1, 2, 3, 4, 5].map((n) => <option key={n} value={year + n}>{t("استلام لحد")} {year + n}</option>)}
              </select>
              <input aria-label={t("أقصى مقدم %")} className={inputCls} inputMode="numeric" placeholder={t("أقصى مقدم %")} value={f.maxDown} onChange={digits("maxDown")} />
              <input aria-label={t("أقل سنين تقسيط")} className={inputCls} inputMode="numeric" placeholder={t("أقل سنين تقسيط")} value={f.minYears} onChange={digits("minYears")} />
              <input aria-label={t("أقل مساحة م²")} className={inputCls} inputMode="numeric" placeholder={t("أقل مساحة م²")} value={f.minSize} onChange={digits("minSize")} />
              <div className="col-span-full flex flex-wrap gap-2 pt-1">
                {AMENITIES.map((a) => { const on = f.amenities.includes(a); return (
                  <button key={a} type="button" onClick={() => set("amenities", on ? f.amenities.filter((x) => x !== a) : [...f.amenities, a])} className={`h-9 rounded-full border px-3 text-xs font-bold transition ${on ? "border-primary bg-primary text-primary-foreground" : "bg-card text-primary hover:border-teal"}`}>{t(a)}</button>
                ); })}
              </div>
            </div>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <label className="flex h-9 cursor-pointer items-center gap-2 rounded-full border px-3 text-xs font-bold text-primary">
              <input type="checkbox" checked={f.availableOnly} onChange={(e) => set("availableOnly", e.target.checked)} />{t("فيه وحدات متاحة بس")}
            </label>
            <button type="button" onClick={() => setMore(!more)} className="flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-bold text-primary hover:border-teal"><SlidersHorizontal className="size-3.5" />{more ? t("فلاتر أقل") : t("فلاتر أكتر")}</button>
            {active && <button type="button" onClick={() => setF(EMPTY_COMPOUND_FILTERS)} className="flex h-9 items-center gap-1 px-2 text-xs font-bold text-muted-foreground hover:text-destructive"><X className="size-3.5" />{t("مسح الفلاتر")}</button>}
            {q.data && <span className="ms-auto text-xs font-bold text-muted-foreground">{formatPrice(rows.length)} {t("كمبوند")}</span>}
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-6xl gap-4 px-4 pt-5 sm:grid-cols-2 md:px-6 lg:grid-cols-3">
        {q.isLoading && [0, 1, 2].map((i) => <div key={i} className="h-80 animate-pulse rounded-2xl bg-muted" />)}
        {q.isError && <p className="col-span-full rounded-2xl bg-destructive/10 p-4 text-sm text-destructive">{t("الكمبوندات ماحمّلتش، حدّث الصفحة.")}</p>}
        {q.data && all.length === 0 && <p className="col-span-full rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">{t("لسه مفيش كمبوندات منشورة.")} <a href="/#request" className="font-bold text-teal">{t("اطلب وحدة في كمبوند")}</a></p>}
        {q.data && all.length > 0 && rows.length === 0 && (
          <div className="col-span-full rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
            {t("مفيش كمبوند بالمواصفات دي.")}
            <button onClick={() => setF(EMPTY_COMPOUND_FILTERS)} className={`${btnOutline} mx-auto mt-3`}>{t("مسح الفلاتر")}</button>
          </div>
        )}
        {rows.map((c) => {
          const from = startingPrice(c);
          const available = c.compound_units.filter((u) => u.status === "available").length;
          const matches = matchingUnits(c, f).length;
          const dev = developerLabel(c, c.developer);
          return (
            <Link key={c.id} to="/compounds/$id" params={{ id: c.id }} className="group overflow-hidden rounded-2xl border bg-card shadow-card transition hover:-translate-y-0.5">
              <div className="relative">
                <img src={compoundCover(c)} alt={c.name} loading="lazy" className="h-48 w-full object-cover" />
                {c.is_featured && <span className="absolute start-3 top-3 rounded-full bg-teal px-2.5 py-0.5 text-[11px] font-bold text-accent-foreground">{t("مميز")}</span>}
                {isReady(c) && <span className="absolute end-3 top-3 rounded-full bg-primary/90 px-2.5 py-0.5 text-[11px] font-bold text-primary-foreground">{t("استلام فوري")}</span>}
              </div>
              <div className="p-4">
                <h2 className="truncate text-lg font-extrabold text-primary group-hover:text-teal">{c.name}</h2>
                {dev && <p className="truncate text-xs font-bold text-muted-foreground">{dev}</p>}
                <p className="mt-1.5 flex items-center gap-1 text-sm text-muted-foreground"><MapPin className="size-4 text-teal" />{t(compoundWhere(c))}</p>
                <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-bold text-primary">
                  {c.down_payment_pct != null && <span className="flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5"><Wallet className="size-3" />{Number(c.down_payment_pct) === 0 ? t("بدون مقدم") : `${t("مقدم")} ${Number(c.down_payment_pct)}%`}</span>}
                  {c.installment_years != null && c.installment_years > 0 && <span className="rounded-full bg-secondary px-2 py-0.5">{c.installment_years} {t("سنين تقسيط")}</span>}
                  {c.delivery_date && !isReady(c) && <span className="flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5"><CalendarClock className="size-3" />{c.delivery_date}</span>}
                </div>
                <div className="mt-3 flex items-end justify-between gap-2 border-t pt-3">
                  <div>
                    <p className="text-[11px] text-muted-foreground">{t("يبدأ من")}</p>
                    <p className="font-extrabold text-primary">{from != null ? `${formatPrice(from)} ${t("ج.م")}` : t("اسأل عن السعر")}</p>
                  </div>
                  <p className={`text-xs font-bold ${available ? "text-teal" : "text-muted-foreground"}`}>
                    {active && matches !== available ? `${formatPrice(matches)} ${t("وحدة مناسبة")}` : available ? `${formatPrice(available)} ${t("وحدة متاحة")}` : t("قريبًا")}
                  </p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </PageShell>
  );
}
