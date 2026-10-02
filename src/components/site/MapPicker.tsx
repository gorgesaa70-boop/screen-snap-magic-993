import { useCallback, useEffect, useRef, useState } from "react";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { Search, LocateFixed, X } from "lucide-react";
import { toast } from "sonner";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_maps";

export type LatLng = { lat: number; lng: number };

/** Server-side geocoding through the Lovable connector gateway (browser key is not authorized for Geocoding). */
export const geocodeAddress = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ q: z.string().min(3).max(200) }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true; lat: number; lng: number; formatted: string } | { ok: false; error: string }> => {
    const LOVABLE_API_KEY = process.env["LOVABLE_API_KEY"];
    const GOOGLE_MAPS_API_KEY = process.env["GOOGLE_MAPS_API_KEY"];
    if (!LOVABLE_API_KEY || !GOOGLE_MAPS_API_KEY) return { ok: false, error: "maps_not_configured" };
    const res = await fetch(`${GATEWAY_URL}/maps/api/geocode/json?address=${encodeURIComponent(data.q)}&language=ar`, {
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "X-Connection-Api-Key": GOOGLE_MAPS_API_KEY },
    });
    if (res.status === 403) {
      const body = (await res.json().catch(() => null)) as { error?: { details?: Array<{ reason?: string }> } } | null;
      const reason = body?.error?.details?.find((d) => d.reason)?.reason;
      if (reason === "API_KEY_HTTP_REFERRER_BLOCKED") return { ok: false, error: "مفتاح خرائط جوجل للخادم مقيد بالنطاقات. عدّل قيود المفتاح في Google Cloud إلى None أو IP." };
      if (reason === "API_KEY_SERVICE_BLOCKED") return { ok: false, error: "مفتاح خرائط جوجل للخادم لا يسمح بخدمة تحديد العناوين. فعّل Geocoding API في Google Cloud." };
      return { ok: false, error: "تم رفض طلب خرائط جوجل (403). راجع قيود المفتاح في Google Cloud." };
    }
    if (!res.ok) return { ok: false, error: `فشل البحث عن العنوان (${res.status})` };
    const json = (await res.json()) as { status?: string; results?: Array<{ formatted_address: string; geometry: { location: { lat: number; lng: number } } }> };
    if (json.status !== "OK" || !json.results?.length) return { ok: false, error: "لم يتم العثور على العنوان، جرّب وصفًا أدق" };
    const r = json.results[0]!;
    return { ok: true, lat: r.geometry.location.lat, lng: r.geometry.location.lng, formatted: r.formatted_address };
  });

/* ---- Maps JS API loader (browser key; loads once per page) ---- */
let loaderPromise: Promise<void> | null = null;

export function loadMapsApi(): Promise<void> {
  if (loaderPromise) return loaderPromise;
  const key = import.meta.env["VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY"] as string | undefined;
  if (!key) return Promise.reject(new Error("maps_key_missing"));
  loaderPromise = new Promise((resolve, reject) => {
    const w = window as unknown as Record<string, unknown>;
    w["__vaMapsReady"] = () => resolve();
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&loading=async&callback=__vaMapsReady&language=ar&region=EG&channel=${import.meta.env["VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID"] ?? "valueaqar"}`;
    s.async = true;
    s.onerror = () => reject(new Error("maps_load_failed"));
    document.head.appendChild(s);
  });
  return loaderPromise;
}

const BORG_EL_ARAB: LatLng = { lat: 30.8658, lng: 29.5967 };

type Props = { value: LatLng | null; onChange: (v: LatLng | null) => void };

/** Click-to-pin location picker with current-location and search support. */
export function MapPicker({ value, onChange }: Props) {
  const boxRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadMapsApi()
      .then(() => {
        if (cancelled || !boxRef.current || mapRef.current) return;
        const g = (window as any).google;
        const center = value ?? BORG_EL_ARAB;
        const map = new g.maps.Map(boxRef.current, {
          center, zoom: value ? 16 : 13, clickableIcons: false,
          styles: [{ featureType: "poi", stylers: [{ visibility: "off" }] }],
        });
        map.addListener("click", (e: any) => {
          if (!e.latLng) return;
          setMarker({ lat: e.latLng.lat(), lng: e.latLng.lng() });
        });
        mapRef.current = map;
        if (value) placeMarker(value);
        setReady(true);
      })
      .catch(() => setFailed("load"));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function placeMarker(pos: LatLng) {
    const g = (window as any).google;
    if (markerRef.current) { markerRef.current.setPosition(pos); return; }
    markerRef.current = new g.maps.Marker({ position: pos, map: mapRef.current, draggable: true });
    markerRef.current.addListener("dragend", (e: any) => onChange({ lat: e.latLng.lat(), lng: e.latLng.lng() }));
  }

  const setMarker = useCallback((pos: LatLng) => {
    if (!mapRef.current) return;
    placeMarker(pos);
    mapRef.current.panTo(pos);
    onChange(pos);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onChange]);

  function clearMarker() {
    if (markerRef.current) { markerRef.current.setMap(null); markerRef.current = null; }
    onChange(null);
  }

  function useMyLocation() {
    if (!navigator.geolocation) { toast.error("المتصفح لا يدعم تحديد الموقع"); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => setMarker({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => toast.error("تعذّر تحديد موقعك، تأكد من السماح بالوصول للموقع"),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (q.trim().length < 3) return;
    setSearching(true);
    try {
      const r = await geocodeAddress({ data: { q: q.trim() } });
      if (r.ok) setMarker({ lat: r.lat, lng: r.lng });
      else toast.error(r.error);
    } finally { setSearching(false); }
  }

  if (failed) return <p className="rounded-xl bg-destructive/10 p-3 text-xs font-semibold text-destructive">تعذّر تحميل الخريطة حاليًا. يمكنك حفظ العقار بدون تحديد الموقع.</p>;

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <form onSubmit={search} className="flex min-w-56 flex-1 items-center gap-1.5 rounded-xl border bg-background px-3">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث عن عنوان أو منطقة…" className="h-10 w-full bg-transparent text-sm outline-none" />
        </form>
        <button type="button" onClick={useMyLocation} className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-secondary px-3 text-sm font-bold text-primary hover:bg-teal-soft">
          <LocateFixed className="size-4 text-teal" />موقعي الحالي
        </button>
        {value && (
          <button type="button" onClick={clearMarker} className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-secondary px-3 text-sm font-bold text-destructive hover:bg-destructive/10">
            <X className="size-4" />مسح
          </button>
        )}
      </div>
      <div ref={boxRef} className="mt-2 h-64 w-full overflow-hidden rounded-xl border bg-muted" />
      <p className="mt-1.5 text-xs text-muted-foreground">
        {value ? `تم تحديد الموقع (${value.lat.toFixed(5)}, ${value.lng.toFixed(5)})` : ready ? "انقر على الخريطة لتحديد موقع العقار، أو ابحث عن عنوان." : "جارٍ تحميل الخريطة…"}
      </p>
    </div>
  );
}
