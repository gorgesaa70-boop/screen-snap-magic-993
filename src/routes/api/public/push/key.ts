import { createFileRoute } from "@tanstack/react-router";

/** The site's public push key, which browsers need to subscribe (public by design). */
export const Route = createFileRoute("/api/public/push/key")({
  server: {
    handlers: {
      GET: async () => {
        const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
        const { siteVapid } = await import("@/lib/push.server");
        try {
          const { publicKey } = await siteVapid(db);
          return Response.json({ publicKey }, { headers: { "Cache-Control": "public, max-age=3600" } });
        } catch {
          // Before release-22 is applied there is no push_config yet.
          return Response.json({ publicKey: null }, { status: 503 });
        }
      },
    },
  },
});
