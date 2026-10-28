import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { Megaphone, X } from "lucide-react";
import { dbx } from "@/lib/dbx";
import { t, useLang } from "@/lib/i18n";
import { useInstallApp } from "@/lib/install-app";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useTodaySpotlight } from "@/lib/plan-perks";
import { formatPrice } from "@/components/site/data";

/** The pinned message the admin writes in لوحة الإدارة ← الإعدادات ← رسالة التثبيت. */
export type Announcement = {
  on: boolean; ar: string; en: string; url: string; popup: boolean; startsAt: string | null; endsAt: string | null;
};

export async function fetchAnnouncement(): Promise<Announcement | null> {
  const { data, error } = await dbx.from("app_settings")
    .select("announce_on, announce_ar, announce_en, announce_url, announce_popup, announce_starts_at, announce_ends_at").eq("id", 1).maybeSingle();
  // Before release-20 is applied the columns don't exist: the site simply shows no message.
  if (error || !data) return null;
  return {
    on: data.announce_on, ar: data.announce_ar ?? "", en: data.announce_en ?? "", url: data.announce_url ?? "",
    popup: data.announce_popup, startsAt: data.announce_starts_at, endsAt: data.announce_ends_at,
  };
}

export const useAnnouncement = () => useQuery({ queryKey: ["site-announcement"], queryFn: fetchAnnouncement, staleTime: 5 * 60_000 });

/** On, has text, and inside its optional start/end window. */
export function isLive(a: Announcement | null | undefined, now = Date.now()): a is Announcement {
  if (!a?.on || a.ar.trim().length < 2) return false;
  if (a.startsAt && Date.parse(a.startsAt) > now) return false;
  if (a.endsAt && Date.parse(a.endsAt) <= now) return false;
  return true;
}

/** Changes whenever the message changes, so a new message shows again to visitors who closed the old one. */
function versionOf(a: Announcement) {
  const s = `${a.ar}|${a.en}|${a.url}`;
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return String(h);
}

const BAR_KEY = "va-announce-closed";
const POPUP_KEY = "va-announce-popup-seen";
const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode: shows again next visit */ } };

const textFor = (a: Announcement, lang: string) => (lang === "en" && a.en.trim() ? a.en : a.ar);

function MessageLink({ a, className }: { a: Announcement; className: string }) {
  if (!a.url) return null;
  const external = a.url.startsWith("https://");
  return (
    <a href={a.url} className={className} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>{t("التفاصيل")}</a>
  );
}

/** The message as it looks on the site; also used as the admin preview. */
export function AnnouncementBarView({ a, onClose }: { a: Announcement; onClose?: () => void }) {
  const { lang, dir } = useLang();
  return (
    <div dir={dir} role="status" className="flex min-h-9 items-center gap-2 bg-teal px-3 py-1.5 text-xs font-bold text-accent-foreground sm:text-sm">
      <Megaphone className="size-4 shrink-0" aria-hidden="true" />
      <p className="flex-1 leading-snug">
        {textFor(a, lang)}
        {a.url && <> <MessageLink a={a} className="ms-1 whitespace-nowrap underline underline-offset-2" /></>}
      </p>
      {onClose && (
        <button type="button" onClick={onClose} aria-label={t("إغلاق")} title={t("إغلاق")} className="grid size-7 shrink-0 place-items-center rounded-full hover:bg-black/10">
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}

/** Pinned bar over the header; when there is no message (or the visitor closed it) the `fallback` shows instead. */
export function AnnouncementBar({ fallback }: { fallback: ReactNode }) {
  const q = useAnnouncement();
  const a = q.data;
  // localStorage is read after mount so the server render and the first client render match.
  const [closed, setClosed] = useState<string | null | undefined>(undefined);
  useEffect(() => { setClosed(read(BAR_KEY)); }, []);
  const spot = <SpotlightBar />;
  if (closed === undefined || !isLive(a)) return <>{fallback}{spot}</>;
  const v = versionOf(a);
  if (closed === v) return <>{fallback}{spot}</>;
  return <><AnnouncementBarView a={a} onClose={() => { write(BAR_KEY, v); setClosed(v); }} />{spot}</>;
}

const SPOT_KEY = "va-spotlight-closed";
/** «عرض للكل»: the listing an account booked for today, in a slim bar every visitor sees (closable for the day). */
function SpotlightBar() {
  const { dir } = useLang();
  const q = useTodaySpotlight();
  const s = q.data;
  const [closed, setClosed] = useState<string | null | undefined>(undefined);
  useEffect(() => { setClosed(read(SPOT_KEY)); }, []);
  if (!s || closed === undefined || closed === s.id) return null;
  const place = s.area === s.city ? s.city : `${s.area}، ${s.city}`;
  return (
    <div dir={dir} className="flex min-h-9 items-center gap-2 bg-[#f2b84b] px-3 py-1.5 text-xs font-bold text-primary sm:text-sm">
      <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-[10px] text-primary-foreground">{t("عرض اليوم")}</span>
      <a href={`/properties/${s.id}`} className="line-clamp-1 flex-1 hover:underline">{s.title} · {place} · {formatPrice(Number(s.price))} {t("ج.م")}</a>
      <button type="button" onClick={() => { write(SPOT_KEY, s.id); setClosed(s.id); }} aria-label={t("إغلاق")} title={t("إغلاق")} className="grid size-7 shrink-0 place-items-center rounded-full hover:bg-black/10">
        <X className="size-4" />
      </button>
    </div>
  );
}

/** One-time popup for big announcements, on every page except the admin panel (which has its own preview). */
export function AnnouncementPopup() {
  const { lang, dir } = useLang();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const q = useAnnouncement();
  const a = q.data;
  const [seen, setSeen] = useState<string | null | undefined>(undefined);
  const { state: installState, install } = useInstallApp();
  const [showIosHelp, setShowIosHelp] = useState(false);
  // Opens a moment after the page settles, so it never covers the page while it is still loading.
  useEffect(() => { const id = setTimeout(() => setSeen(read(POPUP_KEY)), 1200); return () => clearTimeout(id); }, []);
  if (seen === undefined || !isLive(a) || !a.popup || path.startsWith("/admin")) return null;
  const v = versionOf(a);
  const close = () => { write(POPUP_KEY, v); setSeen(v); };
  // The "التفاصيل" button installs the web app instead of opening a page.
  const onDetails = () => {
    if (installState === "prompt") void install();
    else if (installState === "ios") setShowIosHelp(true);
  };
  return (
    <Dialog open={seen !== v} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent dir={dir} className="w-[calc(100%-2rem)] max-w-md rounded-2xl border-teal/40 p-6 text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-teal text-accent-foreground"><Megaphone className="size-6" /></span>
        <DialogTitle className="text-lg font-extrabold text-primary">{t("فاليو عقار")}</DialogTitle>
        <DialogDescription className="whitespace-pre-line text-base leading-relaxed text-foreground">{textFor(a, lang)}</DialogDescription>
        {showIosHelp ? (
          <p className="rounded-xl bg-muted p-3 text-sm font-bold leading-6 text-primary">
            {t("من متصفح سفاري: اضغط زر «مشاركة» ثم اختر «إضافة إلى الشاشة الرئيسية» لتثبيت التطبيق.")}
          </p>
        ) : (
          <div className="flex flex-wrap justify-center gap-2">
            {a.url && installState !== "unavailable" && (
              <button type="button" onClick={onDetails} className="inline-flex h-11 items-center rounded-full bg-primary px-6 text-sm font-bold text-primary-foreground">
                {t("التفاصيل")}
              </button>
            )}
            <button type="button" onClick={close} className="h-11 rounded-full border px-6 text-sm font-bold text-primary">{t("إغلاق")}</button>
          </div>
        )}
        {showIosHelp && (
          <button type="button" onClick={close} className="mt-2 h-11 rounded-full border px-6 text-sm font-bold text-primary">{t("إغلاق")}</button>
        )}
      </DialogContent>
    </Dialog>
  );
}
