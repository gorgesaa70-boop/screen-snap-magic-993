/**
 * Item 30: remember which ad / campaign brought a visitor (first touch, 30 days) and send it with every lead.
 * The database turns it into the lead source + campaign (leads_ad_source trigger); nothing here is trusted.
 */
const KEY = "va-attr";
const TTL = 30 * 24 * 3600 * 1000;
const PARAMS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "gclid", "fbclid", "ttclid"] as const;

export type Attribution = Partial<Record<(typeof PARAMS)[number] | "ref" | "landing", string>>;

/** Call once per page load: stores the first ad click / outside referrer seen in the last 30 days. */
export function captureAttribution() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null") as { at: number; a: Attribution } | null;
    const url = new URL(window.location.href);
    const a: Attribution = {};
    for (const k of PARAMS) { const v = url.searchParams.get(k); if (v) a[k] = v.slice(0, 120); }
    let ref = "";
    try { ref = document.referrer ? new URL(document.referrer).hostname : ""; } catch { /* ignore */ }
    if (ref && ref !== url.hostname) a.ref = ref.slice(0, 80);
    const fromAd = PARAMS.some((k) => a[k]);
    // An ad click always wins over an older plain visit; otherwise keep the first touch until it expires.
    if (!fromAd && saved && Date.now() - saved.at < TTL) return;
    if (!fromAd && !a.ref) return;
    a.landing = url.pathname.slice(0, 120);
    localStorage.setItem(KEY, JSON.stringify({ at: Date.now(), a }));
  } catch { /* storage blocked: no attribution */ }
}

export function getAttribution(): Attribution | null {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null") as { at: number; a: Attribution } | null;
    return saved && Date.now() - saved.at < TTL ? saved.a : null;
  } catch { return null; }
}
