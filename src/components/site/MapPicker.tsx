import { useCallback, useEffect, useRef, useState } from "react";
import type * as Leaflet from "leaflet";
import { Search, LocateFixed, X } from "lucide-react";
import { toast } from "sonner";
import { BORG_EL_ARAB, brandPin, createMap, loadLeaflet, searchPlace, type LatLng } from "@/lib/osm";

export type { LatLng };

/** allowSearch=false hides the address search; pinning by tap or current location still works. */
type Props = { value: LatLng | null; onChange: (v: LatLng | null) => void; allowSearch?: boolean };

/** Tap-to-pin location picker (free OpenStreetMap) with current-location and address search. Opens on Borg El Arab. */
export function MapPicker({ value, onChange, allowSearch = true }: Props) {
  const boxRef = useRef<HTMLDivElement>(null);
  const LRef = useRef<typeof Leaflet | null>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const markerRef = useRef<Leaflet.Marker | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);

  const placeMarker = useCallback((pos: LatLng) => {
    const L = LRef.current, map = mapRef.current;
    if (!L || !map) return;
    if (markerRef.current) { markerRef.current.setLatLng(pos); return; }
    const m = L.marker(pos, { icon: brandPin(L), draggable: true, keyboard: false }).addTo(map);
    m.on("dragend", () => { const p = m.getLatLng(); onChangeRef.current({ lat: p.lat, lng: p.lng }); });
    markerRef.current = m;
  }, []);

  const setMarker = useCallback((pos: LatLng, zoom?: number) => {
    if (!mapRef.current) return;
    placeMarker(pos);
    mapRef.current.setView(pos, zoom ?? Math.max(mapRef.current.getZoom(), 15));
    onChangeRef.current(pos);
  }, [placeMarker]);

  useEffect(() => {
    let cancelled = false;
    loadLeaflet()
      .then((L) => {
        if (cancelled || !boxRef.current || mapRef.current) return;
        LRef.current = L;
        const map = createMap(L, boxRef.current, value ?? BORG_EL_ARAB, value ? 16 : 13);
        map.on("click", (e: Leaflet.LeafletMouseEvent) => setMarker({ lat: e.latlng.lat, lng: e.latlng.lng }, map.getZoom()));
        mapRef.current = map;
        if (value) placeMarker(value);
        setReady(true);
      })
      .catch(() => setFailed(true));
    return () => { cancelled = true; mapRef.current?.remove(); mapRef.current = null; markerRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function clearMarker() {
    markerRef.current?.remove();
    markerRef.current = null;
    onChange(null);
  }

  function useMyLocation() {
    if (!navigator.geolocation) { toast.error("المتصفح لا يدعم تحديد الموقع"); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => setMarker({ lat: p.coords.latitude, lng: p.coords.longitude }, 17),
      () => toast.error("تعذّر تحديد موقعك، تأكد من السماح بالوصول للموقع"),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  // The picker sits inside other forms, so search runs on Enter / button instead of a nested <form> (whose submit would bubble to the outer form).
  async function search() {
    if (searching || q.trim().length < 3) return;
    setSearching(true);
    try {
      const r = await searchPlace(q.trim());
      if (r) setMarker(r, 16);
      else toast.error("لم يتم العثور على العنوان، جرّب اسم منطقة أو شارع أوضح، أو حدّد المكان على الخريطة");
    } catch {
      toast.error("تعذّر البحث حاليًا، حدّد المكان على الخريطة مباشرة");
    } finally { setSearching(false); }
  }

  if (failed) return <p className="rounded-xl bg-destructive/10 p-3 text-xs font-semibold text-destructive">تعذّر تحميل الخريطة حاليًا. يمكنك حفظ العقار بدون تحديد الموقع.</p>;

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {allowSearch && (
          <div className="flex min-w-56 flex-1 items-center gap-1.5 rounded-xl border bg-background ps-3">
            <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void search(); } }} enterKeyHint="search" placeholder="ابحث عن عنوان أو منطقة…" className="h-10 w-full bg-transparent text-sm outline-none" />
            <button type="button" onClick={() => void search()} disabled={searching} aria-label="بحث" className="grid size-10 shrink-0 place-items-center text-muted-foreground hover:text-primary">
              <Search className="size-4" />
            </button>
          </div>
        )}
        <button type="button" onClick={useMyLocation} className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-secondary px-3 text-sm font-bold text-primary hover:bg-teal-soft">
          <LocateFixed className="size-4 text-teal" />موقعي الحالي
        </button>
        {value && (
          <button type="button" onClick={clearMarker} className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-secondary px-3 text-sm font-bold text-destructive hover:bg-destructive/10">
            <X className="size-4" />مسح
          </button>
        )}
      </div>
      <div ref={boxRef} dir="ltr" className="mt-2 h-64 w-full overflow-hidden rounded-xl border bg-muted" />
      <p className="mt-1.5 text-xs text-muted-foreground">
        {value ? `تم تحديد الموقع (${value.lat.toFixed(5)}, ${value.lng.toFixed(5)}) — اسحب العلامة لتعديله` : ready ? "انقر على الخريطة لتحديد موقع العقار، أو ابحث عن عنوان." : "جارٍ تحميل الخريطة…"}
      </p>
    </div>
  );
}
