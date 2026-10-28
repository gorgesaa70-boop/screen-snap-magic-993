import { createFileRoute } from "@tanstack/react-router";
import { absoluteUrl, publicPages } from "@/lib/site-urls";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        try {
          // Changed pages also go to the IndexNow engines (Bing, Yandex…), at most every 6 hours; never blocks the sitemap.
          void import("@/lib/indexnow.server").then((m) => m.sendIndexNow({ minGapMs: 6 * 3600_000 })).catch(() => {});
          const urls = (await publicPages()).map(
            (e) => `  <url>\n    <loc>${esc(absoluteUrl(e.path))}</loc>${e.lastmod ? `\n    <lastmod>${esc(e.lastmod)}</lastmod>` : ""}\n  </url>`
          );
          const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
          return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
        } catch {
          return new Response("Sitemap temporarily unavailable", { status: 503, headers: { "Cache-Control": "no-store" } });
        }
      },
    },
  },
});
