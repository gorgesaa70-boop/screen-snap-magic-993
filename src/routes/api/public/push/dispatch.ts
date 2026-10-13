import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/**
 * Sends a notification to the user's devices right after it is created. Called by the database (pg_net) with the
 * secret from push_config, or by the scheduler (cron secret) to send anything still pending.
 */
export const Route = createFileRoute("/api/public/push/dispatch")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
        const { dispatchPush, pushSecretOk } = await import("@/lib/push.server");
        const fromDb = await pushSecretOk(db, request.headers.get("x-push-secret"));
        if (!fromDb) {
          const denied = await authenticateCronRequest(request);
          if (denied) return denied;
        }
        let id: string | undefined;
        try {
          const body = (await request.json()) as { id?: unknown };
          if (typeof body.id === "string" && /^[0-9a-f-]{36}$/.test(body.id)) id = body.id;
        } catch { /* no body: send everything pending */ }
        try {
          return Response.json(await dispatchPush(db, id));
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          console.error("push dispatch", message);
          await db.rpc("log_app_error", { _kind: "server", _message: `push dispatch: ${message}`.slice(0, 500), _stack: "", _path: "/api/public/push/dispatch", _ua: "" });
          return Response.json({ error: "failed" }, { status: 500 });
        }
      },
    },
  },
});
