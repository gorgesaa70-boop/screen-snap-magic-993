/**
 * Meta Pixel ("Value Aqar Website", business gorg_esaa): lets Meta ads measure who came from an ad and then
 * contacted us. The id is public by design (it sits in every page that uses it), so it lives here, not in Secrets.
 * Only standard events, never personal data: PageView, Contact (a WhatsApp / call link pressed) and Lead (a request
 * or inquiry sent). Loaded a few seconds after the page so it never slows the first paint; nothing runs on the server,
 * on localhost, or inside the native app shell.
 */
export const META_PIXEL_ID = "1867188171384533";

type Fbq = ((...args: unknown[]) => void) & { callMethod?: (...a: unknown[]) => void; queue?: unknown[]; loaded?: boolean; version?: string; push?: unknown };
declare global { interface Window { fbq?: Fbq; _fbq?: Fbq } }

let started = false;

function enabled() {
  if (typeof window === "undefined") return false;
  if (!/(^|\.)valueaqar\.com$/.test(window.location.hostname)) return false;
  // The Android / iOS wrapper reports its own installs; the pixel is for the website.
  return !(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();
}

/** Meta's standard snippet, written out (no inline script tag needed). */
function install() {
  if (window.fbq) return;
  const q: Fbq = function (...args: unknown[]) {
    if (q.callMethod) q.callMethod(...args); else q.queue!.push(args);
  } as Fbq;
  q.push = q; q.loaded = true; q.version = "2.0"; q.queue = [];
  window.fbq = q; window._fbq = q;
  const s = document.createElement("script");
  s.async = true;
  s.src = "https://connect.facebook.net/en_US/fbevents.js";
  document.head.appendChild(s);
  q("init", META_PIXEL_ID);
}

/** Starts the pixel once per page load, then counts this page. */
export function initMetaPixel() {
  if (started || !enabled()) return;
  started = true;
  const go = () => {
    install();
    window.fbq?.("track", "PageView");
    // Any WhatsApp or phone link on the site counts as a contact (the buttons differ page to page).
    document.addEventListener("click", (e) => {
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (a && /^(https:\/\/(wa\.me|api\.whatsapp\.com)\/|tel:)/.test(a.href)) trackMeta("Contact");
    }, { capture: true });
  };
  setTimeout(go, 3000);
}

/** A page change inside the site (no reload). */
export function metaPageView() {
  if (started && window.fbq) window.fbq("track", "PageView");
}

export function trackMeta(event: "Lead" | "Contact") {
  if (typeof window !== "undefined" && window.fbq) window.fbq("track", event);
}
