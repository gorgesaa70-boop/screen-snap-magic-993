import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Listing statistics: showings (a card scrolled into view), views (the listing page opened) and contacts
 * (WhatsApp / call pressed). Each device is a random id kept in the browser — nothing personal — and the
 * database counts it once per listing per day. Failures are ignored: stats must never break a page.
 */
type Kind = "impression" | "view" | "contact";

let deviceId: string | null = null;
function device() {
  if (deviceId) return deviceId;
  const fresh = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 20);
  try {
    deviceId = localStorage.getItem("va_dev");
    if (!deviceId || !/^[A-Za-z0-9_-]{8,64}$/.test(deviceId)) { deviceId = fresh(); localStorage.setItem("va_dev", deviceId); }
  } catch { deviceId = deviceId ?? fresh(); }
  return deviceId;
}

/** Where this visit came from: the referring site, or the page inside the site it started on. */
function source() {
  if (typeof window === "undefined") return "other";
  const ref = document.referrer;
  const host = (() => { try { return ref ? new URL(ref).hostname : ""; } catch { return ""; } })();
  if (host && host !== window.location.hostname) {
    if (/google\./.test(host)) return "google";
    if (/facebook\.com|fb\.|m\.me/.test(host)) return "facebook";
    if (/instagram\.com/.test(host)) return "instagram";
    if (/tiktok\.com/.test(host)) return "tiktok";
    if (/whatsapp|wa\.me/.test(host)) return "whatsapp";
    return "other";
  }
  const utm = new URLSearchParams(window.location.search).get("utm_source")?.toLowerCase() ?? "";
  if (/whatsapp|wa/.test(utm)) return "whatsapp";
  if (/facebook|fb/.test(utm)) return "facebook";
  if (!host) return "direct";
  const path = (() => { try { return new URL(ref).pathname + new URL(ref).search; } catch { return "/"; } })();
  if (path === "/" || path.startsWith("/#")) return "home";
  if (path.includes("?") || path.startsWith("/map")) return "search";
  return "listing";
}

const pending: Record<Kind, Set<string>> = { impression: new Set(), view: new Set(), contact: new Set() };
let timer: ReturnType<typeof setTimeout> | null = null;
function flush() {
  timer = null;
  for (const kind of Object.keys(pending) as Kind[]) {
    const ids = [...pending[kind]].slice(0, 60);
    pending[kind].clear();
    if (!ids.length) continue;
    supabase.rpc("track_listing", { _ids: ids, _kind: kind, _device: device(), _source: source() }).then(() => {}, () => {});
  }
}
function queue(kind: Kind, id: string, now = false) {
  if (typeof window === "undefined" || !/^[0-9a-f-]{36}$/.test(id)) return;
  pending[kind].add(id);
  if (now) { if (timer) clearTimeout(timer); flush(); return; }
  if (!timer) timer = setTimeout(flush, 2500);
}

export const trackView = (id: string) => queue("view", id, true);
export const trackContact = (id: string) => queue("contact", id, true);

/** Count a showing once the element is at least half on screen. */
export function useImpression<T extends Element>(id: string | null | undefined) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !id || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { queue("impression", id); io.disconnect(); }
    }, { threshold: 0.5 });
    io.observe(el);
    return () => io.disconnect();
  }, [id]);
  return ref;
}
