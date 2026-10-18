import { createFileRoute } from "@tanstack/react-router";
import { FEEDS, type FeedName } from "@/lib/feed";

/** How long a copy is served before the database is asked again. */
const TTL_MS = 60_000;

// Each loader is the same public query a visitor's browser would run (publishable key, same row rules).
const loaders: Record<FeedName, () => Promise<unknown>> = {
  properties: async () => (await import("@/components/site/data")).fetchPublicProperties(),
  brokers: async () => (await import("@/components/site/data")).fetchPublicBrokers(),
  locations: async () => (await import("@/components/site/data")).fetchLocationRows(),
  search: async () => (await import("@/components/site/search-everything")).fetchSearchEverything(),
  malls: async () => (await import("@/components/site/malls")).fetchMalls(),
  "mall-summary": async () => (await import("@/components/site/malls")).fetchMallSummary(),
  opportunities: async () => (await import("@/lib/investments")).fetchOpportunities(),
  projects: async () => (await import("@/components/site/projects")).fetchProjects(),
  compounds: async () => (await import("@/components/site/compounds")).fetchCompoundCards(),
};

// Per server instance: the last answer, and the query in flight so a burst of visitors shares one database call.
const memory = new Map<FeedName, { at: number; body: string }>();
const inflight = new Map<FeedName, Promise<string>>();

async function load(name: FeedName) {
  const hit = memory.get(name);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.body;
  let p = inflight.get(name);
  if (!p) {
    p = loaders[name]()
      .then((data) => { const body = JSON.stringify(data); memory.set(name, { at: Date.now(), body }); return body; })
      .finally(() => inflight.delete(name));
    inflight.set(name, p);
  }
  try {
    return await p;
  } catch (e) {
    // Database busy or down: an older copy is better than an error page.
    if (hit) return hit.body;
    throw e;
  }
}

export const Route = createFileRoute("/api/public/feed/$name")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const name = params.name as FeedName;
        if (!FEEDS.includes(name)) return new Response("not found", { status: 404 });
        try {
          const body = await load(name);
          return new Response(body, {
            headers: {
              "content-type": "application/json; charset=utf-8",
              // Browsers keep it 30s; the CDN may share it for a minute and serve the old copy while refreshing.
              "Cache-Control": "public, max-age=30, s-maxage=60, stale-while-revalidate=60",
            },
          });
        } catch {
          return Response.json({ error: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
        }
      },
    },
  },
});
