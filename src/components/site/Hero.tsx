import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, RotateCcw, SlidersHorizontal, ChevronDown, Building2 } from "lucide-react";
import hero640 from "@/assets/hero-640.webp";
import hero960 from "@/assets/hero-960.webp";
import hero1440 from "@/assets/hero-1440.webp";
import hero1920 from "@/assets/hero-1920.webp";
import { CITY_NAMES, CITIES, FINISHING_LABEL, formatPrice, useLocations } from "./data";
import { applyFilters, emptyFilters, extraCount, GROUP_LABELS, isEmpty, SEARCH_TYPES_FOR, type Filters } from "./search";
import { trackAppSearch } from "@/lib/app-metrics";
import { fetchSearchEverything } from "./search-everything";
import { fetchOpportunities } from "@/lib/investments";
import { LiveStrip } from "./LiveStrip";
import { ARABIC_DIGITS, latinDigit } from "@/lib/digits";
import { t, useLang } from "@/lib/i18n";

/** Phones download the 640/960 copy instead of the full 1920px photo. */
const HERO_SRCSET = `${hero640} 640w, ${hero960} 960w, ${hero1440} 1440w, ${hero1920} 1920w`;

const field =
  "h-11 w-full rounded-xl border bg-background px-3 text-base font-medium text-foreground outline-none transition hover:border-primary/40 focus:border-teal focus:ring-2 focus:ring-teal/30 md:px-3.5 md:text-sm";
const lbl = "mb-1 block text-xs font-bold text-muted-foreground";
/** Type and city stay on phones without their labels (the first option says what the box is), to keep the box short. */
const lblDesktop = "sr-only md:not-sr-only md:mb-1 md:block md:text-xs md:font-bold md:text-muted-foreground";
/** Shown on phones only after «فلاتر أكتر» (area and price), always on larger screens; fades in when opened. */
const phoneMore = (open: boolean) => (open ? "animate-in fade-in slide-in-from-top-1 duration-200 motion-reduce:animate-none" : "hidden md:block");

const TABS: [string, string][] = [["", "الكل"], ["بيع", "شراء"], ["إيجار", "إيجار"], ["مصيف", "مصيف"]];
/** The count line under the box splits the units by purpose. */
const PURPOSES: [string, string][] = [["بيع", "للبيع"], ["إيجار", "للإيجار"], ["مصيف", "مصيف"]];
/** Price range label per purpose: rent is monthly; summer compares the lowest price (usually per night). */
const PRICE_LABEL: Record<string, string> = { "إيجار": "الإيجار الشهري من (ج.م)", "مصيف": "السعر من (ج.م، لليلة غالبًا)" };

type Props = { draft: Filters; setDraft: (f: Filters) => void; onSearch: () => void; onClear: () => void };

export function Hero({ draft, setDraft, onSearch, onClear }: Props) {
  useLang();
  useLocations();
  const extras = extraCount(draft);
  // On phones «فلاتر أكتر» also holds the area and the price range.
  const phoneExtras = extras + [draft.area || draft.place, draft.min, draft.max].filter(Boolean).length;
  const [more, setMore] = useState(extras > 0);
  // How many units the current choices match (the same cached list the results use), shown under the box.
  const all = useQuery({ queryKey: ["search-everything"], queryFn: fetchSearchEverything });
  const opps = useQuery({ queryKey: ["opportunities"], queryFn: fetchOpportunities });
  const found = all.data ? applyFilters(all.data, draft) : null;
  const matching = found?.length ?? null;
  // …split by purpose (sale / rent / summer), plus the investment opportunities when nothing is picked yet.
  const parts = found ? [
    ...PURPOSES.map(([s, label]) => [found.filter((p) => p.status === s).length, label] as const),
    ...(isEmpty(draft) ? [[opps.data?.length ?? 0, "فرص استثمارية"] as const] : []),
  ].filter(([n]) => n > 0) : [];
  const [typed, setTyped] = useState(!!draft.place);
  const set = (k: keyof Filters) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setDraft({ ...draft, [k]: e.target.value });

  return (
    <section id="top" className="relative">
      <div className="relative h-[340px] overflow-hidden md:h-[600px]">
        <img src={hero1440} srcSet={HERO_SRCSET} sizes="100vw" alt={t("مجمع سكني حديث في برج العرب الجديدة")} width={1920} height={1088}
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
              onClick={() => setDraft({ ...draft, status: v, type: SEARCH_TYPES_FOR[v]!.includes(draft.type) ? draft.type : "", min: "", max: "", ...(v && v !== "بيع" ? { pay: "", maxDown: "" } : {}) })}
              className={`rounded-xl px-4 py-2 text-sm font-extrabold transition md:px-5 ${draft.status === v ? "bg-primary text-primary-foreground" : "text-primary hover:bg-secondary"}`}>
              {t(label)}
            </button>
          ))}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); trackAppSearch([draft.status, draft.type, draft.group ? GROUP_LABELS[draft.group] : "", draft.city, draft.area, draft.place, draft.verified ? "متحقق منه" : ""], found?.length ?? 0); onSearch(); }}
          className="grid grid-cols-2 gap-x-2.5 gap-y-2.5 rounded-2xl bg-card p-3 shadow-float md:grid-cols-6 md:gap-x-3 md:gap-y-3 md:p-5 rtl:rounded-tr-none ltr:rounded-tl-none">
          <label>
            <span className={lblDesktop}>{t("نوع العقار")}</span>
            <select value={draft.type} onChange={set("type")} className={field}>
              <option value="">{t("كل الأنواع")}</option>
              {SEARCH_TYPES_FOR[draft.status]!.map((v) => <option key={v} value={v}>{t(v)}</option>)}
            </select>
          </label>
          <label>
            <span className={lblDesktop}>{t("المدينة")}</span>
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
          <label className={`order-2 col-span-2 md:order-none md:col-span-1 ${phoneMore(more)}`}>
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
          <label className={`order-2 md:order-none ${phoneMore(more)}`}>
            <span className={lbl}>{t(PRICE_LABEL[draft.status] ?? "السعر من (ج.م)")}</span>
            <input type="number" min={0} inputMode="numeric" placeholder="0" value={draft.min} onChange={set("min")} className={field} />
          </label>
          <label className={`order-2 md:order-none ${phoneMore(more)}`}>
            <span className={lbl}>{t("إلى (ج.م)")}</span>
            <input type="number" min={0} inputMode="numeric" placeholder={t("بلا حد")} value={draft.max} onChange={set("max")} className={field} />
          </label>
          <div className="order-4 col-span-2 flex gap-2 self-end md:order-none md:col-span-1 md:flex-col">
            <button type="submit"
              className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-teal md:flex-none text-base font-extrabold text-accent-foreground shadow-card transition hover:brightness-95 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none active:scale-[0.98] md:text-sm">
              <Search className="size-5 shrink-0" /> {t("ابحث عن عقار")}
            </button>
            {!isEmpty(draft) && (
              <button type="button" onClick={() => { setDraft(emptyFilters); setTyped(false); onClear(); }}
                className="flex h-11 items-center justify-center gap-1.5 rounded-xl border px-4 text-sm font-bold text-primary transition hover:bg-secondary focus-visible:ring-2 focus-visible:ring-teal focus-visible:outline-none active:scale-[0.98] md:h-9">
                <RotateCcw className="size-4 shrink-0" /> {t("مسح")}
              </button>
            )}
          </div>
          <div className="order-1 col-span-2 md:order-none md:col-span-6">
            <button type="button" aria-expanded={more} onClick={() => setMore(!more)}
              className="inline-flex items-center gap-1.5 text-sm font-bold text-primary hover:text-teal">
              <SlidersHorizontal className="size-4" />{t("فلاتر أكتر")}
              {phoneExtras > 0 && <span className="rounded-full bg-teal px-1.5 text-[11px] text-accent-foreground md:hidden">{phoneExtras}</span>}
              {extras > 0 && <span className="hidden rounded-full bg-teal px-1.5 text-[11px] text-accent-foreground md:inline">{extras}</span>}
              <ChevronDown className={`size-4 transition duration-200 ${more ? "rotate-180" : ""}`} />
            </button>
          </div>
          {more && (
            <div className="order-3 col-span-2 grid grid-cols-2 gap-3 border-t pt-3 animate-in fade-in slide-in-from-top-1 duration-200 motion-reduce:animate-none md:order-none md:col-span-6 md:grid-cols-4">
              {(draft.status === "" || draft.status === "بيع") && (
                <>
                  <label>
                    <span className={lbl}>{t("التحقق")}</span>
                    <select value={draft.verified ?? ""} onChange={set("verified")} className={field}>
                      <option value="">{t("كل الإعلانات")}</option>
                      <option value="1">{t("متحقق منه بس")}</option>
                    </select>
                  </label>
                  <label>
                    <span className={lbl}>{t("فيديو")}</span>
                    <select value={draft.video ?? ""} onChange={set("video")} className={field}>
                      <option value="">{t("كل الإعلانات")}</option>
                      <option value="1">{t("فيه فيديو بس")}</option>
                    </select>
                  </label>
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
        {/* Live count: what's on the site now, or how many match the choices so far (before pressing «ابحث»). */}
        <div className="mt-2.5 min-h-5 px-1" aria-live="polite">
          {matching != null && (
            <div key={`${isEmpty(draft)}-${matching}-${parts.length}`} className="flex flex-wrap items-center gap-1.5 text-sm font-bold text-primary animate-in fade-in duration-300 motion-reduce:animate-none">
              <Building2 className="size-4 text-teal" />
              {matching
                ? <span>{formatPrice(matching)} {t(isEmpty(draft) ? "وحدة معروضة" : "وحدة مطابقة")}</span>
                : <span>{t("مفيش وحدات مطابقة، جرّب توسّع البحث")}</span>}
              {parts.map(([n, label]) => (
                <span key={label} className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-bold text-primary">
                  {formatPrice(n)} {t(label)}
                </span>
              ))}
            </div>
          )}
        </div>
        {found && <LiveStrip list={found} />}
      </div>
    </section>
  );
}
