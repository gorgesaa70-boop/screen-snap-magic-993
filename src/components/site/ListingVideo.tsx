import { useState } from "react";
import { ExternalLink, Play } from "lucide-react";
import { t, useLang } from "@/lib/i18n";
import { VIDEO_NAMES, parseVideo } from "@/lib/video";

/** The platform's player loads only after a tap, so a listing with a video opens as fast as one without. */
export function ListingVideo({ url, poster, title }: { url: string; poster: string; title: string }) {
  useLang();
  const [playing, setPlaying] = useState(false);
  const video = parseVideo(url);
  if (!video) return null;
  const openLabel = t("افتح الفيديو على {name}", { name: t(VIDEO_NAMES[video.platform]) });
  const cover = (
    <>
      <img src={poster} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
      <span className="absolute inset-0 bg-black/30" />
      <span className="absolute inset-0 m-auto grid size-16 place-items-center rounded-full bg-background/95 text-primary shadow-float"><Play className="ms-1 size-7 fill-current" /></span>
    </>
  );
  const box = `relative mx-auto block w-full overflow-hidden rounded-2xl bg-muted ${video.tall && playing ? "aspect-[9/16] max-w-xs" : "aspect-video"}`;
  return (
    <section className="mt-5">
      <h2 className="mb-2 text-lg font-extrabold text-primary">{t("فيديو العقار")}</h2>
      {playing && video.embed ? (
        <div className={box}>
          <iframe src={video.embed} title={title} className="absolute inset-0 size-full border-0" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
        </div>
      ) : video.embed ? (
        <button type="button" aria-label={t("شغّل الفيديو")} onClick={() => setPlaying(true)} className={box}>{cover}</button>
      ) : (
        <a href={video.url} target="_blank" rel="noreferrer noopener" aria-label={openLabel} className={box}>{cover}</a>
      )}
      {/* A video that was deleted or made private can't be detected inside the frame, so the link is always there. */}
      <a href={video.url} target="_blank" rel="noreferrer noopener" className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-primary hover:text-teal"><ExternalLink className="size-3.5" />{openLabel}</a>
    </section>
  );
}
