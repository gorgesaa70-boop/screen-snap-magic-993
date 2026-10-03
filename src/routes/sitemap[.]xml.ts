import { createFileRoute } from "@tanstack/react-router";
import { SITE_URL } from "@/lib/seo";

const STATIC_PATHS = ["/", "/brokers", "/industrial", "/malls", "/map"];

type Entry = { path: string; lastmod?: string };
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);

async function collect(table: string, cols: string, apply: (q: any) => any, toEntry: (r: any) => Entry) {
  const { supabase } = await import("@/integrations/supabase/client");
  const out: Entry[] = [];
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

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const [res, ind, brokers, malls] = await Promise.all([
            collect("properties", "id,updated_at", (q) => q.eq("review_status", "approved").eq("category", "residential"), (r) => ({ path: `/properties/${r.id}`, lastmod: r.updated_at })),
            collect("properties", "id,updated_at", (q) => q.eq("review_status", "approved").eq("category", "industrial"), (r) => ({ path: `/industrial/${r.id}`, lastmod: r.updated_at })),
            collect("brokers", "id,slug", (q) => q.eq("is_active", true), (r) => ({ path: `/brokers/${encodeURIComponent(r.slug)}` })),
            collect("malls", "id", (q) => q.eq("is_active", true), (r) => ({ path: `/malls/${r.id}` })),
          ]);
          const entries: Entry[] = [...STATIC_PATHS.map((path) => ({ path })), ...res, ...ind, ...brokers, ...malls];
          const urls = entries.map((e) => `<url><loc>${esc(SITE_URL + (e.path === "/" ? "/" : e.path))}</loc>${e.lastmod ? `<lastmod>${esc(e.lastmod)}</lastmod>` : ""}</url>`);
          const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join("")}</urlset>`;
          return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
        } catch {
          return new Response("Sitemap temporarily unavailable", { status: 503, headers: { "Cache-Control": "no-store" } });
        }
      },
    },
  },
});
