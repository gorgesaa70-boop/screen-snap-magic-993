import { useState } from "react";
import { CITY_NAMES, areasOf, useLocations } from "./data";
import { Field, inputCls } from "./ui";
import { t, useLang } from "@/lib/i18n";

const OTHER = "__other__";
const clean = (s: string) => s.replace(/\s+/g, " ").slice(0, 60);

/** True when the place is filled in well enough to save. */
export const placeReady = (p: { city: string; area: string }) => {
  const city = p.city.trim(), area = p.area.trim();
  if (city.length < 2) return false;
  // A known city with areas needs one; a city without areas (or a new city) may be left without.
  const known = CITY_NAMES.includes(city) && areasOf(city).some((a) => a !== city);
  return known ? area.length >= 2 : area === "" || area.length >= 2;
};

/**
 * City + area for a listing form. The last choice in each list is «another city / area»: the person types it, the
 * listing is saved with it, and the place waits for the admin before it shows in filters.
 * Cities without areas store the city name as the area.
 */
export function PlacePicker({ city, area, onChange, translate = false }: {
  city: string; area: string; onChange: (v: { city: string; area: string }) => void; translate?: boolean;
}) {
  useLang();
  useLocations();
  const tr = (s: string) => (translate ? t(s) : s);
  const knownCity = CITY_NAMES.includes(city);
  const areas = knownCity ? areasOf(city).filter((a) => a !== city) : [];
  const knownArea = !knownCity ? false : areas.length ? areas.includes(area) : area === city;
  const [newCity, setNewCity] = useState(!!city && !knownCity);
  const [newArea, setNewArea] = useState(!!area && knownCity && !knownArea);
  const typedCity = newCity || !knownCity;
  const cityHasAreas = !typedCity && areas.length > 0;

  return (
    <>
      <Field label={tr("المدينة")}>
        <select className={inputCls} value={typedCity ? OTHER : city} onChange={(e) => {
          const v = e.target.value;
          if (v === OTHER) { setNewCity(true); setNewArea(false); onChange({ city: "", area: "" }); return; }
          setNewCity(false); setNewArea(false);
          const list = areasOf(v).filter((a) => a !== v);
          onChange({ city: v, area: list.length ? "" : v });
        }}>
          {CITY_NAMES.map((c) => <option key={c} value={c}>{tr(c)}</option>)}
          <option value={OTHER}>{tr("مدينة تانية…")}</option>
        </select>
        {typedCity && (
          <input className={`${inputCls} mt-2`} value={city} maxLength={60} placeholder={tr("اكتب اسم المدينة، مثال: الإسكندرية")}
            onChange={(e) => onChange({ city: clean(e.target.value), area })} />
        )}
      </Field>
      <Field label={tr("المنطقة / الحي")}>
        {cityHasAreas && (
          <select className={inputCls} value={newArea ? OTHER : area} onChange={(e) => {
            const v = e.target.value;
            if (v === OTHER) { setNewArea(true); onChange({ city, area: "" }); return; }
            setNewArea(false); onChange({ city, area: v });
          }}>
            <option value="">{tr("اختر")}</option>
            {areas.map((a) => <option key={a} value={a}>{tr(a)}</option>)}
            <option value={OTHER}>{tr("منطقة تانية…")}</option>
          </select>
        )}
        {(typedCity || newArea) && (
          <input className={`${inputCls} ${cityHasAreas ? "mt-2" : ""}`} value={area === city && typedCity ? "" : area} maxLength={60}
            placeholder={tr(typedCity ? "اسم المنطقة (سيبها فاضية لو المدينة كلها)" : "اكتب اسم المنطقة")}
            onChange={(e) => onChange({ city, area: clean(e.target.value) })} />
        )}
        {!typedCity && !cityHasAreas && <input className={inputCls} value={tr(city)} disabled readOnly />}
        {(typedCity || newArea) && <p className="mt-1 text-xs text-muted-foreground">{tr("المنطقة الجديدة هتظهر في البحث بعد مراجعة فريق فاليو عقار.")}</p>}
      </Field>
    </>
  );
}

/** What to save: a typed city with no area stores the city as the area. */
export const placeToSave = (p: { city: string; area: string }) => {
  const city = p.city.trim();
  const area = p.area.trim() || city;
  return { city, area };
};
