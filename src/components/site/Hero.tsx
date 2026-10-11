import { Search, RotateCcw } from "lucide-react";
import hero from "@/assets/hero.jpg";
import { CITY_NAMES, CITIES, TYPES_FOR } from "./data";
import { emptyFilters, isEmpty, type Filters } from "./search";
import { t, useLang } from "@/lib/i18n";

const field =
  "h-12 w-full rounded-xl border bg-background px-3.5 text-base font-medium text-foreground outline-none transition hover:border-primary/40 focus:border-teal focus:ring-2 focus:ring-teal/30 md:h-11 md:text-sm";
const lbl = "mb-1 block text-xs font-bold text-muted-foreground";

const TABS: [string, string][] = [["", "الكل"], ["بيع", "شراء"], ["إيجار", "إيجار"], ["مصيف", "مصيف"]];
/** Price range label per purpose: rent is monthly; summer compares the lowest price (usually per night). */
const PRICE_LABEL: Record<string, string> = { "إيجار": "الإيجار الشهري من (ج.م)", "مصيف": "السعر من (ج.م، لليلة غالبًا)" };

type Props = { draft: Filters; setDraft: (f: Filters) => void; onSearch: () => void; onClear: () => void };

export function Hero({ draft, setDraft, onSearch, onClear }: Props) {
  useLang();
  const set = (k: keyof Filters) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setDraft({ ...draft, [k]: e.target.value });

  return (
    <section id="top" className="relative">
      <div className="relative h-[340px] overflow-hidden md:h-[600px]">
        <img src={hero} alt={t("مجمع سكني حديث في برج العرب الجديدة")} width={1920} height={1088}
          fetchPriority="high" decoding="async" className="absolute inset-0 size-full object-cover" />
        <div className="absolute inset-0 bg-hero-overlay" />
        <div className="relative mx-auto max-w-7xl px-4 pt-8 md:px-6 md:pt-28">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary-foreground/25 bg-primary-foreground/10 px-3 py-1 text-xs font-semibold text-primary-foreground backdrop-blur">
            <span className="size-1.5 rounded-full bg-teal" /> {t("برج العرب والساحل الشمالي")}
          </span>
          <h1 className="mt-3 max-w-2xl text-[1.75rem] leading-snug font-extrabold text-primary-foreground [text-shadow:0_2px_12px_rgb(0_0_0/0.35)] md:mt-5 md:text-6xl md:leading-[1.15]">
            {t("عقارك المناسب،")} <span className="text-teal">{t("أقرب")}</span>{t(" مما تتخيل")}
          </h1>
          <p className="mt-2.5 max-w-xl text-sm leading-relaxed text-primary-foreground/90 md:mt-5 md:text-lg">
            {t("اكتشف العقارات المتاحة في برج العرب والساحل الشمالي، وقارن الخيارات، وتواصل مع الوسيط المناسب بكل سهولة.")}
          </p>
        </div>
      </div>

      <div id="search" className="relative z-10 mx-auto -mt-28 max-w-6xl scroll-mt-20 px-4 md:-mt-36 md:px-6">
        <div role="tablist" aria-label={t("الغرض")} className="flex w-fit gap-1 rounded-t-2xl bg-card p-1.5 pb-0 shadow-float">
          {TABS.map(([v, label]) => (
            <button key={v || "all"} type="button" role="tab" aria-selected={draft.status === v}
              onClick={() => setDraft({ ...draft, status: v, type: TYPES_FOR[v]!.includes(draft.type) ? draft.type : "", min: "", max: "" })}
              className={`rounded-xl px-4 py-2 text-sm font-extrabold transition md:px-5 ${draft.status === v ? "bg-primary text-primary-foreground" : "text-primary hover:bg-secondary"}`}>
              {t(label)}
            </button>
          ))}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); onSearch(); }}
          className="grid grid-cols-2 gap-x-3 gap-y-3 rounded-2xl bg-card p-4 shadow-float md:grid-cols-6 md:p-5 rtl:rounded-tr-none ltr:rounded-tl-none">
          <label>
            <span className={lbl}>{t("نوع العقار")}</span>
            <select value={draft.type} onChange={set("type")} className={field}>
              <option value="">{t("الكل")}</option>
              {TYPES_FOR[draft.status]!.map((v) => <option key={v} value={v}>{t(v)}</option>)}
            </select>
          </label>
          <label>
            <span className={lbl}>{t("المدينة")}</span>
            <select value={draft.city ?? ""} onChange={(e) => setDraft({ ...draft, city: e.target.value, area: "" })} className={field}>
              <option value="">{t("كل المدن")}</option>
              {CITY_NAMES.map((v) => <option key={v} value={v}>{t(v)}</option>)}
            </select>
          </label>
          <label>
            <span className={lbl}>{t("المنطقة / الحي")}</span>
            <select value={draft.area} onChange={set("area")} className={field} disabled={!CITIES[draft.city ?? ""]?.length}>
              <option value="">{t("كل المناطق")}</option>
              {(CITIES[draft.city ?? ""] ?? []).map((v) => <option key={v} value={v}>{t(v)}</option>)}
            </select>
          </label>
          <label>
            <span className={lbl}>{t(PRICE_LABEL[draft.status] ?? "السعر من (ج.م)")}</span>
            <input type="number" min={0} inputMode="numeric" placeholder="0" value={draft.min} onChange={set("min")} className={field} />
          </label>
          <label>
            <span className={lbl}>{t("إلى (ج.م)")}</span>
            <input type="number" min={0} inputMode="numeric" placeholder={t("بلا حد")} value={draft.max} onChange={set("max")} className={field} />
          </label>
          <div className="col-span-2 flex gap-2 self-end md:col-span-1 md:flex-col">
            <button type="submit"
              className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-teal text-base font-extrabold text-accent-foreground shadow-card transition hover:brightness-95 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none active:scale-[0.98] md:h-11 md:text-sm">
              <Search className="size-5 shrink-0" /> {t("ابحث عن عقار")}
            </button>
            {!isEmpty(draft) && (
              <button type="button" onClick={() => { setDraft(emptyFilters); onClear(); }}
                className="flex h-12 items-center justify-center gap-1.5 rounded-xl border px-4 text-sm font-bold text-primary transition hover:bg-secondary focus-visible:ring-2 focus-visible:ring-teal focus-visible:outline-none active:scale-[0.98] md:h-9">
                <RotateCcw className="size-4 shrink-0" /> {t("مسح")}
              </button>
            )}
          </div>
        </form>
      </div>
    </section>
  );
}
