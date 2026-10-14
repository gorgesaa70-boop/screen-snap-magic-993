import { SITE_URL } from "@/lib/seo";

/** IndexNow key. Not a secret: the protocol publishes it at /<key>.txt so search engines can check we own the site. */
export const INDEXNOW_KEY = "7c2634d3ce1140f698df0ac7c20553e1";

const STATIC_PATHS = ["/", "/brokers", "/industrial", "/malls", "/compounds", "/projects", "/investments", "/app", "/map", "/privacy", "/terms", "/delete-account", "/shared-housing", "/services", "/broker-network"];

export type SiteEntry = { path: string; lastmod?: string };

async function collect(table: string, cols: string, apply: (q: any) => any, toEntry: (r: any) => SiteEntry) {
  const { supabase } = await import("@/integrations/supabase/client");
  const out: SiteEntry[] = [];
  const size = 1000;
  for (let from = 0; ; ) {
    const { data, error } = await apply((supabase as any).from(table).select(cols)).order("id").range(from, from + size - 1);
    if (error) throw error;
    if (!data?.length) break;
    out.push(...data.map(toEntry));
    from += data.length;
    if (data.length < size) break;
  }
  return out;
}

/** Every public page search engines should know about. Demo listings and demo brokers are never included. */
export async function publicPages(): Promise<SiteEntry[]> {
  const [res, ind, brokers, malls, compounds, projects] = await Promise.all([
    collect("properties", "id,updated_at", (q) => q.eq("review_status", "approved").eq("category", "residential").eq("is_demo", false), (r) => ({ path: `/properties/${r.id}`, lastmod: r.updated_at })),
    collect("properties", "id,updated_at", (q) => q.eq("review_status", "approved").eq("category", "industrial").eq("is_demo", false), (r) => ({ path: `/industrial/${r.id}`, lastmod: r.updated_at })),
    collect("brokers", "id,slug", (q) => q.eq("is_active", true).eq("is_demo", false), (r) => ({ path: `/brokers/${encodeURIComponent(r.slug)}` })),
    collect("malls", "id", (q) => q.eq("is_active", true), (r) => ({ path: `/malls/${r.id}` })),
    collect("compounds", "id", (q) => q.eq("is_active", true), (r) => ({ path: `/compounds/${r.id}` })),
    collect("projects", "id,updated_at", (q) => q.eq("review_status", "approved"), (r) => ({ path: `/projects/${r.id}`, lastmod: r.updated_at })),
  ]);
  // Price pages only once they have numbers (empty ones are noindex anyway).
  const { data: idx } = await (await import("@/integrations/supabase/client")).supabase.rpc("price_index");
  const totals = (idx ?? []).filter((r) => r.month === null);
  const prices: SiteEntry[] = totals.length
    ? [{ path: "/prices" },
       ...[...new Set(totals.filter((r) => r.kind === "mall").map((r) => r.mall_id))].map((id) => ({ path: `/prices/malls/${id}` })),
       ...[...new Set(totals.filter((r) => r.kind === "residential").map((r) => r.area))].map((a) => ({ path: `/prices/areas/${encodeURIComponent(a)}` }))]
    : [];
  // Approved service providers' public profiles (the directory function returns approved ones only).
  const { data: providers } = await (await import("@/integrations/supabase/client")).supabase.rpc("service_directory", {});
  const services: SiteEntry[] = (providers ?? []).map((p) => ({ path: `/services/${p.id}` }));
  return [...STATIC_PATHS.map((path) => ({ path })), ...res, ...ind, ...brokers, ...malls, ...compounds, ...projects, ...prices, ...services];
}

export const absoluteUrl = (path: string) => SITE_URL + (path === "/" ? "/" : path);
