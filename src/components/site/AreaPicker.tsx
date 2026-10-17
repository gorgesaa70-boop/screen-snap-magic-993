import { CITY_NAMES, areasOf, useLocations } from "./data";
import { t } from "@/lib/i18n";

/** Multi-select of areas grouped under their city; "الكل" toggles every area of that city. */
export function AreaPicker({ value, onChange, small }: { value: string[]; onChange: (v: string[]) => void; small?: boolean }) {
  useLocations();
  const toggle = (a: string) => onChange(value.includes(a) ? value.filter((x) => x !== a) : [...value, a]);
  const chip = `rounded-full border font-bold transition ${small ? "h-9 px-3 text-xs" : "h-10 px-4 text-sm"}`;
  return (
    <div className="space-y-3">
      {CITY_NAMES.map((city) => {
        const areas = areasOf(city);
        const all = areas.every((a) => value.includes(a));
        return (
          <div key={city}>
            <div className="mb-1.5 flex items-center gap-2">
              <p className="text-xs font-bold text-muted-foreground">{t(city)}</p>
              {areas.length > 1 && (
                <button type="button" onClick={() => onChange(all ? value.filter((x) => !areas.includes(x)) : [...new Set([...value, ...areas])])}
                  className="text-xs font-bold text-primary hover:text-teal">{all ? t("إلغاء الكل") : t("الكل")}</button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {areas.map((a) => { const on = value.includes(a); return (
                <button key={a} type="button" aria-pressed={on} onClick={() => toggle(a)}
                  className={`${chip} ${on ? "border-primary bg-primary text-primary-foreground" : "bg-card text-primary hover:border-teal"}`}>{t(a)}</button>
              ); })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
