import type * as Leaflet from "leaflet";

/**
 * Free maps: OpenStreetMap tiles drawn with Leaflet — no API key, no billing.
 * If traffic grows past OSM's fair-use policy, swap TILE_URL for another free tile host.
 */
export type LatLng = { lat: number; lng: number };
export const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';
export const BORG_EL_ARAB: LatLng = { lat: 30.8658, lng: 29.5967 };

/** Leaflet touches `window`, so it loads only in the browser (once per page). */
let leaflet: Promise<typeof Leaflet> | null = null;
export function loadLeaflet(): Promise<typeof Leaflet> {
  leaflet ??= Promise.all([import("leaflet"), import("leaflet/dist/leaflet.css")]).then(([m]) => (m.default ?? m) as typeof Leaflet);
  return leaflet;
}

/** Brand pin (navy with mint dot) as an inline SVG — avoids Leaflet's bundled marker images. */
export function brandPin(L: typeof Leaflet) {
  return L.divIcon({
    className: "",
    html: '<svg width="32" height="42" viewBox="0 0 32 42" aria-hidden="true"><path d="M16 1C7.7 1 1 7.6 1 15.8 1 27 16 41 16 41s15-14 15-25.2C31 7.6 24.3 1 16 1z" style="fill:var(--primary)" stroke="#fff" stroke-width="2"/><circle cx="16" cy="15.5" r="6" style="fill:var(--teal)"/></svg>',
    iconSize: [32, 42],
    iconAnchor: [16, 41],
    popupAnchor: [0, -36],
  });
}

/** A base map with OSM tiles; scroll-zoom stays off so the page scrolls normally over it. */
export function createMap(L: typeof Leaflet, el: HTMLElement, center: LatLng, zoom: number) {
  const map = L.map(el, { center, zoom, scrollWheelZoom: false, attributionControl: true });
  L.tileLayer(TILE_URL, { maxZoom: 19, attribution: TILE_ATTRIBUTION }).addTo(map);
  map.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>');
  return map;
}

/** Opens Google Maps (app or web) at a point — a plain link, no key needed. */
export const googleMapsLink = ({ lat, lng }: LatLng) => `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

/** Address search with OpenStreetMap's free geocoder (Nominatim), limited to Egypt. */
export async function searchPlace(q: string, lang: "ar" | "en" = "ar"): Promise<(LatLng & { label: string }) | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=eg&accept-language=${lang}&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`search_failed_${res.status}`);
  const rows = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>;
  const r = rows[0];
  return r ? { lat: Number(r.lat), lng: Number(r.lon), label: r.display_name } : null;
}
