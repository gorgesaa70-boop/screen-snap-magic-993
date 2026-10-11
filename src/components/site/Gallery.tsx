import { useState } from "react";
import { MapPin, ChevronLeft, ChevronRight } from "lucide-react";
import { t, useLang } from "@/lib/i18n";

export function PlaceMap({ lat, lng, label }: { lat: number; lng: number; label?: string }) {
  const { lang } = useLang();
  const key = import.meta.env["VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY"] as string | undefined;
  if (!key) return null;
  return (
    <div className="mt-6">
      <h2 className="mb-2 flex items-center gap-1.5 text-lg font-extrabold text-primary"><MapPin className="size-5 text-teal" />{t("الموقع على الخريطة")}</h2>
      <iframe
        title={label ?? t("موقع العقار على الخريطة")}
        src={`https://www.google.com/maps/embed/v1/place?key=${key}&q=${lat},${lng}&zoom=15&language=${lang}&region=EG`}
        className="h-64 w-full rounded-2xl border bg-muted md:h-80"
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        allowFullScreen
      />
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
