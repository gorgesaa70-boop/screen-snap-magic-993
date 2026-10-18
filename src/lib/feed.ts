/**
 * Public lists that are the same for every visitor (approved listings, malls, brokers, places…) are served from
 * /api/public/feed/<name>, which keeps a copy for a minute. So a thousand visitors cost the database one query a
 * minute instead of a thousand. Edits show up within a minute.
 */
export const FEEDS = ["properties", "search", "mall-summary", "malls", "brokers", "locations", "opportunities", "projects", "compounds"] as const;
export type FeedName = (typeof FEEDS)[number];

/** In the browser read the cached feed (falling back to the database if it fails); on the server query directly. */
export async function viaFeed<T>(name: FeedName, direct: () => Promise<T>): Promise<T> {
  if (typeof window === "undefined") return direct();
  try {
    const r = await fetch(`/api/public/feed/${name}`);
    if (r.ok) return (await r.json()) as T;
  } catch { /* offline or blocked: fall through */ }
  return direct();
}
