import { useEffect, useRef, useState } from "react";
import { loadMapsApi } from "./MapPicker";
import { formatPrice, type Property } from "./data";
import { t, useLang } from "@/lib/i18n";

const esc = (v: string) => v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] || c);

/** One map showing every property that has coordinates; marker opens a card linking to the property page. */
export function PropertiesMap({ properties, showError = false }: { properties: Property[]; showError?: boolean }) {
  const { lang, dir } = useLang();
  const boxRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const [failed, setFailed] = useState(false);
  const located = properties.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));

  useEffect(() => {
    let cancelled = false;
    const markers: any[] = [];
    loadMapsApi()
      .then(() => {
        if (cancelled || !boxRef.current) return;
        const g = (window as any).google;
        if (!mapRef.current) {
          mapRef.current = new g.maps.Map(boxRef.current, {
            center: { lat: 30.9, lng: 29.7 }, zoom: 11, clickableIcons: false,
            mapTypeControl: false, streetViewControl: false, fullscreenControl: true,
          });
        }
        const map = mapRef.current;
        const info = new g.maps.InfoWindow();
        const bounds = new g.maps.LatLngBounds();
        located.forEach((p) => {
          if (p.lat == null || p.lng == null) return;
          const position = { lat: p.lat, lng: p.lng };
          const m = new g.maps.Marker({ position, map, title: p.title });
          m.addListener("click", () => {
            info.setContent(`<div dir="${dir}" class="min-w-40 font-sans"><strong>${esc(p.title)}</strong><p class="my-1">${formatPrice(p.price)} ${esc(t("ج.م"))}</p><a href="/properties/${encodeURIComponent(p.id)}" class="font-bold text-teal">${esc(t("عرض التفاصيل"))}</a></div>`);
            info.open({ map, anchor: m });
          });
          markers.push(m);
          bounds.extend(position);
        });
        if (markers.length > 1) map.fitBounds(bounds);
        else if (markers.length === 1) { map.setCenter(markers[0].getPosition()); map.setZoom(15); }
      })
      .catch(() => setFailed(true));
    return () => { cancelled = true; markers.forEach((m) => m.setMap(null)); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [located.map((p) => p.id).join(","), lang, dir]);

  if (failed) return showError ? <p className="rounded-2xl bg-destructive/10 p-4 text-center text-sm font-semibold text-destructive">{t("تعذّر تحميل الخريطة حاليًا. تأكد من الاتصال أو من إعداد مفتاح الخرائط.")}</p> : null;
  if (located.length === 0) return null;
  return (
    <div className="mb-6">
      <div ref={boxRef} className="h-72 w-full overflow-hidden rounded-2xl border bg-muted md:h-[500px]" />
      <p className="mt-1.5 text-xs text-muted-foreground">{formatPrice(located.length)} {t("عقار على الخريطة — اضغط على العلامة لعرض التفاصيل.")}</p>
    </div>
  );
}
