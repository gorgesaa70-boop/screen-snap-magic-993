import { CITY_NAMES, areasOf, cityOfArea, useLocations } from "@/components/site/data";
import { inputCls } from "@/components/site/ui";
import { t, useLang } from "@/lib/i18n";

/** City + area filter with every known area (not only the ones that have listings), so it always works.
 * Renders two selects side by side; picking an area also sets its city. */
export function AreaFilter({ city, area, onChange, className = inputCls }: { city: string; area: string; onChange: (v: { city: string; area: string }) => void; className?: string }) {
  useLocations();
  useLang();
  const cities = city ? [city] : CITY_NAMES;
  return (
    <>
      <select aria-label={t("المدينة")} className={className} value={city} onChange={(e) => onChange({ city: e.target.value, area: "" })}>
        <option value="">{t("كل المدن")}</option>
        {CITY_NAMES.map((c) => <option key={c} value={c}>{t(c)}</option>)}
      </select>
      <select aria-label={t("المنطقة")} className={className} value={area} onChange={(e) => onChange({ city: e.target.value ? cityOfArea(e.target.value) || city : city, area: e.target.value })}>
        <option value="">{t("كل المناطق")}</option>
        {cities.map((c) => {
          const list = areasOf(c).filter((a) => a !== c);
          if (!list.length) return null;
          return city ? list.map((a) => <option key={a} value={a}>{t(a)}</option>) : (
            <optgroup key={c} label={t(c)}>{list.map((a) => <option key={a} value={a}>{t(a)}</option>)}</optgroup>
          );
        })}
      </select>
    </>
  );
}

/** True when a row (with city/area) matches the chosen city and area. Cities without areas store the city as the area. */
export const matchesArea = (row: { city?: string | null; area?: string | null }, f: { city: string; area: string }) =>
  (!f.city || row.city === f.city || (!row.city && row.area != null && cityOfArea(row.area) === f.city)) && (!f.area || row.area === f.area);
