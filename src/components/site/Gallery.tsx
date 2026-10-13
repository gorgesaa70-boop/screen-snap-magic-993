import { useEffect, useRef, useState } from "react";
import { MapPin, ChevronLeft, ChevronRight, Navigation } from "lucide-react";
import { brandPin, createMap, googleMapsLink, loadLeaflet } from "@/lib/osm";
import { t } from "@/lib/i18n";

/** Read-only map with the brand pin (free OpenStreetMap) and a link that opens Google Maps for directions. */
export function PlaceMap({ lat, lng, label }: { lat: number; lng: number; label?: string }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let map: { remove: () => void } | null = null, cancelled = false;
    loadLeaflet()
      .then((L) => {
        if (cancelled || !boxRef.current) return;
        const m = createMap(L, boxRef.current, { lat, lng }, 15);
        L.marker({ lat, lng }, { icon: brandPin(L), keyboard: false }).addTo(m);
        map = m;
      })
      .catch(() => setFailed(true));
    return () => { cancelled = true; map?.remove(); };
  }, [lat, lng]);
  return (
    <div className="mt-6">
      <h2 className="mb-2 flex items-center gap-1.5 text-lg font-extrabold text-primary"><MapPin className="size-5 text-teal" />{t("الموقع على الخريطة")}</h2>
      {!failed && <div ref={boxRef} dir="ltr" role="img" aria-label={label ?? t("موقع العقار على الخريطة")} className="h-64 w-full overflow-hidden rounded-2xl border bg-muted md:h-80" />}
      <a href={googleMapsLink({ lat, lng })} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1.5 rounded-xl bg-secondary px-3 py-2 text-sm font-bold text-primary hover:bg-teal-soft">
        <Navigation className="size-4 text-teal" />{t("افتح في جوجل ماب")}
      </a>
    </div>
  );
}

/** Main photo with thumbnails; swipeable strip on phones. */
export function Gallery({ images, title, children }: { images: string[]; title: string; children?: React.ReactNode }) {
  const [i, setI] = useState(0);
  const go = (d: number) => setI((x) => (x + d + images.length) % images.length);
  return (
    <>
      <div className="relative overflow-hidden rounded-2xl bg-muted">
      <img src={images[i]} alt={title} className="aspect-[4/3] w-full object-cover md:aspect-video" />
      {children}
      {images.length > 1 && (
        <>
          <button type="button" onClick={() => go(-1)} aria-label={t("الصورة السابقة")} className="absolute top-1/2 right-3 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-background/85 text-primary shadow"><ChevronRight className="size-5" /></button>
          <button type="button" onClick={() => go(1)} aria-label={t("الصورة التالية")} className="absolute top-1/2 left-3 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-background/85 text-primary shadow"><ChevronLeft className="size-5" /></button>
          <span className="absolute bottom-3 left-3 rounded-full bg-background/85 px-2.5 py-1 text-xs font-bold text-primary" dir="ltr">{i + 1} / {images.length}</span>
        </>
      )}
      </div>
      {images.length > 1 && (
          <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
            {images.map((src, j) => (
              <button key={src} type="button" onClick={() => setI(j)} aria-label={`${t("صورة")} ${j + 1}`}
                className={`h-16 w-20 shrink-0 overflow-hidden rounded-lg border-2 ${j === i ? "border-teal" : "border-transparent opacity-70"}`}>
                <img src={src} alt="" loading="lazy" className="size-full object-cover" />
              </button>
            ))}
          </div>
      )}
    </>
  );
}
