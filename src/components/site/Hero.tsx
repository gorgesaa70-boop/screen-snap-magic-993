import { Search, RotateCcw } from "lucide-react";
import hero from "@/assets/hero.jpg";
import { CITY_NAMES, CITIES, TYPES } from "./data";
import { emptyFilters, isEmpty, type Filters } from "./search";

const field =
  "h-12 w-full rounded-xl border bg-background px-3.5 text-base font-medium text-foreground outline-none transition hover:border-primary/40 focus:border-teal focus:ring-2 focus:ring-teal/30 md:h-11 md:text-sm";
const lbl = "mb-1 block text-xs font-bold text-muted-foreground";

type Props = { draft: Filters; setDraft: (f: Filters) => void; onSearch: () => void; onClear: () => void };

export function Hero({ draft, setDraft, onSearch, onClear }: Props) {
  const set = (k: keyof Filters) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setDraft({ ...draft, [k]: e.target.value });

  return (
    <section id="top" className="relative">
      <div className="relative h-[340px] overflow-hidden md:h-[600px]">
        <img src={hero} alt="مجمع سكني حديث في برج العرب الجديدة" width={1920} height={1088}
          fetchPriority="high" decoding="async" className="absolute inset-0 size-full object-cover" />
        <div className="absolute inset-0 bg-hero-overlay" />
        <div className="relative mx-auto max-w-7xl px-4 pt-8 md:px-6 md:pt-28">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary-foreground/25 bg-primary-foreground/10 px-3 py-1 text-xs font-semibold text-primary-foreground backdrop-blur">
            <span className="size-1.5 rounded-full bg-teal" /> برج العرب الجديدة
          </span>
          <h1 className="mt-3 max-w-2xl text-[1.75rem] leading-snug font-extrabold text-primary-foreground [text-shadow:0_2px_12px_rgb(0_0_0/0.35)] md:mt-5 md:text-6xl md:leading-[1.15]">
            عقارك المناسب، <span className="text-teal">أقرب</span> مما تتخيل
          </h1>
          <p className="mt-2.5 max-w-xl text-sm leading-relaxed text-primary-foreground/90 md:mt-5 md:text-lg">
            اكتشف العقارات المتاحة في برج العرب، وقارن الخيارات، وتواصل مع الوسيط المناسب بكل سهولة.
          </p>
        </div>
      </div>

      <div id="search" className="relative z-10 mx-auto -mt-28 max-w-6xl scroll-mt-20 px-4 md:-mt-36 md:px-6">
        <form onSubmit={(e) => { e.preventDefault(); onSearch(); }}
          className="grid grid-cols-2 gap-x-3 gap-y-3 rounded-2xl bg-card p-4 shadow-float md:grid-cols-7 md:p-5">
          <label>
            <span className={lbl}>نوع العقار</span>
            <select value={draft.type} onChange={set("type")} className={field}>
              <option value="">الكل</option>
              {TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </label>
          <label>
            <span className={lbl}>الغرض</span>
            <select value={draft.status} onChange={set("status")} className={field}>
              <option value="">الكل</option><option>بيع</option><option>إيجار</option>
            </select>
          </label>
          <label>
            <span className={lbl}>المدينة</span>
            <select value={draft.city ?? ""} onChange={(e) => setDraft({ ...draft, city: e.target.value, area: "" })} className={field}>
              <option value="">كل المدن</option>
              {CITY_NAMES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </label>
          <label>
            <span className={lbl}>المنطقة / الحي</span>
            <select value={draft.area} onChange={set("area")} className={field} disabled={!CITIES[draft.city ?? ""]?.length}>
              <option value="">كل المناطق</option>
              {(CITIES[draft.city ?? ""] ?? []).map((t) => <option key={t}>{t}</option>)}
            </select>
          </label>
          <label>
            <span className={lbl}>السعر من (ج.م)</span>
            <input type="number" min={0} inputMode="numeric" placeholder="0" value={draft.min} onChange={set("min")} className={field} />
          </label>
          <label>
            <span className={lbl}>إلى (ج.م)</span>
            <input type="number" min={0} inputMode="numeric" placeholder="بلا حد" value={draft.max} onChange={set("max")} className={field} />
          </label>
          <div className="col-span-2 flex gap-2 self-end md:col-span-1 md:flex-col">
            <button type="submit"
              className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-teal text-base font-extrabold text-accent-foreground shadow-card transition hover:brightness-95 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none active:scale-[0.98] md:h-11 md:text-sm">
              <Search className="size-5 shrink-0" /> ابحث عن عقار
            </button>
            {!isEmpty(draft) && (
              <button type="button" onClick={() => { setDraft(emptyFilters); onClear(); }}
                className="flex h-12 items-center justify-center gap-1.5 rounded-xl border px-4 text-sm font-bold text-primary transition hover:bg-secondary focus-visible:ring-2 focus-visible:ring-teal focus-visible:outline-none active:scale-[0.98] md:h-9">
                <RotateCcw className="size-4 shrink-0" /> مسح
              </button>
            )}
          </div>
        </form>
      </div>
    </section>
  );
}
