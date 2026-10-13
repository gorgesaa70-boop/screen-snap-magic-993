import { useEffect, useRef, useState } from "react";
import type * as Leaflet from "leaflet";
import { formatPrice, type Property } from "./data";
import { brandPin, createMap, loadLeaflet } from "@/lib/osm";
import { t, useLang } from "@/lib/i18n";

const esc = (v: string) => v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] || c);

/** One map (free OpenStreetMap) showing every property that has coordinates; a pin opens a card linking to the property page. */
export function PropertiesMap({ properties, showError = false }: { properties: Property[]; showError?: boolean }) {
  const { lang, dir } = useLang();
  const boxRef = useRef<HTMLDivElement>(null);
  const LRef = useRef<typeof Leaflet | null>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const located = properties.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  const hasPins = located.length > 0;

  // The map exists while there is something to show; it is removed when the list empties or on unmount.
  useEffect(() => {
    if (!hasPins) return;
    let cancelled = false;
    loadLeaflet()
      .then((L) => {
        if (cancelled || !boxRef.current || mapRef.current) return;
        LRef.current = L;
        mapRef.current = createMap(L, boxRef.current, { lat: 30.9, lng: 29.7 }, 11);
        setReady(true);
      })
      .catch(() => setFailed(true));
    return () => { cancelled = true; mapRef.current?.remove(); mapRef.current = null; setReady(false); };
  }, [hasPins]);

  // Pins follow the list (and the language, for the card text).
  useEffect(() => {
    const L = LRef.current, map = mapRef.current;
    if (!ready || !L || !map) return;
    const group = L.featureGroup();
    located.forEach((p) => {
      if (p.lat == null || p.lng == null) return;
      L.marker({ lat: p.lat, lng: p.lng }, { icon: brandPin(L), title: p.title })
        .bindPopup(`<div dir="${dir}" class="min-w-40 font-sans"><strong>${esc(p.title)}</strong><p class="my-1">${formatPrice(p.price)} ${esc(t("ج.م"))}</p><a href="/properties/${encodeURIComponent(p.id)}" class="font-bold text-teal">${esc(t("عرض التفاصيل"))}</a></div>`)
        .addTo(group);
    });
    group.addTo(map);
    const n = group.getLayers().length;
    if (n > 1) map.fitBounds(group.getBounds(), { padding: [30, 30], maxZoom: 16 });
    else if (n === 1) map.setView(group.getBounds().getCenter(), 15);
    return () => { group.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, located.map((p) => p.id).join(","), lang, dir]);

  if (failed) return showError ? <p className="rounded-2xl bg-destructive/10 p-4 text-center text-sm font-semibold text-destructive">{t("تعذّر تحميل الخريطة حاليًا. تأكد من الاتصال أو من إعداد مفتاح الخرائط.")}</p> : null;
  if (!hasPins) return null;
  return (
    <div className="mb-6">
      <div ref={boxRef} dir="ltr" className="h-72 w-full overflow-hidden rounded-2xl border bg-muted md:h-[500px]" />
      <p className="mt-1.5 text-xs text-muted-foreground">{formatPrice(located.length)} {t("عقار على الخريطة — اضغط على العلامة لعرض التفاصيل.")}</p>
    </div>
  );
}
