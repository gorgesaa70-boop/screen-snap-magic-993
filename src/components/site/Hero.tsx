import { useState } from "react";
import { Search, RotateCcw, SlidersHorizontal, ChevronDown } from "lucide-react";
import hero from "@/assets/hero.jpg";
import { CITY_NAMES, CITIES, TYPES_FOR, FINISHING_LABEL, useLocations } from "./data";
import { emptyFilters, extraCount, isEmpty, type Filters } from "./search";
import { ARABIC_DIGITS, latinDigit } from "@/lib/digits";
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
  useLocations();
  const extras = extraCount(draft);
  const [more, setMore] = useState(extras > 0);
  const [typed, setTyped] = useState(!!draft.place);
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

      <div id="search" className="relative z-10 mx-auto -mt-28 max-w-6xl scroll-mt-28 px-4 md:-mt-36 md:px-6">
        <div role="tablist" aria-label={t("الغرض")} className="flex w-fit gap-1 rounded-t-2xl bg-card p-1.5 pb-0 shadow-float">
          {TABS.map(([v, label]) => (
            <button key={v || "all"} type="button" role="tab" aria-selected={draft.status === v}
              onClick={() => setDraft({ ...draft, status: v, type: TYPES_FOR[v]!.includes(draft.type) ? draft.type : "", min: "", max: "", ...(v && v !== "بيع" ? { pay: "", maxDown: "" } : {}) })}
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
            <select value={typed ? "__other__" : draft.city ?? ""} className={field} onChange={(e) => {
              const other = e.target.value === "__other__";
              setTyped(other);
              setDraft({ ...draft, city: other ? "" : e.target.value, area: "", place: "" });
            }}>
              <option value="">{t("كل المدن")}</option>
              {CITY_NAMES.map((v) => <option key={v} value={v}>{t(v)}</option>)}
              <option value="__other__">{t("مدينة تانية…")}</option>
            </select>
          </label>
          <label>
            <span className={lbl}>{t("المنطقة / الحي")}</span>
            {typed ? (
              <input value={draft.place ?? ""} onChange={set("place")} maxLength={60} className={field} placeholder={t("اكتب المدينة أو المنطقة")} />
            ) : (
              <select value={draft.area} onChange={set("area")} className={field} disabled={!CITIES[draft.city ?? ""]?.length}>
                <option value="">{t("كل المناطق")}</option>
                {(CITIES[draft.city ?? ""] ?? []).map((v) => <option key={v} value={v}>{t(v)}</option>)}
              </select>
            )}
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
              <button type="button" onClick={() => { setDraft(emptyFilters); setTyped(false); onClear(); }}
                className="flex h-12 items-center justify-center gap-1.5 rounded-xl border px-4 text-sm font-bold text-primary transition hover:bg-secondary focus-visible:ring-2 focus-visible:ring-teal focus-visible:outline-none active:scale-[0.98] md:h-9">
                <RotateCcw className="size-4 shrink-0" /> {t("مسح")}
              </button>
            )}
          </div>
          <div className="col-span-2 md:col-span-6">
            <button type="button" aria-expanded={more} onClick={() => setMore(!more)}
              className="inline-flex items-center gap-1.5 text-sm font-bold text-primary hover:text-teal">
              <SlidersHorizontal className="size-4" />{t("فلاتر أكتر")}{extras > 0 && <span className="rounded-full bg-teal px-1.5 text-[11px] text-accent-foreground">{extras}</span>}
              <ChevronDown className={`size-4 transition ${more ? "rotate-180" : ""}`} />
            </button>
          </div>
          {more && (
            <div className="col-span-2 grid grid-cols-2 gap-3 border-t pt-3 md:col-span-6 md:grid-cols-4">
              {(draft.status === "" || draft.status === "بيع") && (
                <>
                  <label>
                    <span className={lbl}>{t("طريقة الدفع")}</span>
                    <select value={draft.pay ?? ""} onChange={set("pay")} className={field}>
                      <option value="">{t("كاش أو تقسيط")}</option>
                      <option value="installment">{t("تقسيط بس")}</option>
                    </select>
                  </label>
                  <label>
                    <span className={lbl}>{t("أقصى مقدم (ج.م)")}</span>
                    <input inputMode="numeric" placeholder={t("بلا حد")} value={draft.maxDown ?? ""} className={field}
                      onChange={(e) => setDraft({ ...draft, maxDown: e.target.value.replace(ARABIC_DIGITS, latinDigit).replace(/\D/g, "").slice(0, 13), pay: e.target.value ? "installment" : draft.pay ?? "" })} />
                  </label>
                </>
              )}
              <label>
                <span className={lbl}>{t("عدد الغرف (على الأقل)")}</span>
                <select value={draft.rooms ?? ""} onChange={set("rooms")} className={field}>
                  <option value="">{t("أي عدد")}</option>
                  {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}+</option>)}
                </select>
              </label>
              <label>
                <span className={lbl}>{t("التشطيب")}</span>
                <select value={draft.finishing ?? ""} onChange={set("finishing")} className={field}>
                  <option value="">{t("أي تشطيب")}</option>
                  {Object.entries(FINISHING_LABEL).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}
                </select>
              </label>
            </div>
          )}
        </form>
      </div>
    </section>
  );
}
