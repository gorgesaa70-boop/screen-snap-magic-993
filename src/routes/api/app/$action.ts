import { createFileRoute } from "@tanstack/react-router";

/**
 * A stable HTTP door for the native app (React Native) to the few things that run only on this server:
 * WhatsApp sign-in, an owner's listing with photos, and the site assistant. Everything else the app reads and
 * writes straight from Supabase under the same row rules as the site.
 *
 * Each action calls the very same server function the website uses (same checks, limits and logs), so the
 * two never drift apart. Bump API_VERSION when a request or answer changes shape in a breaking way.
 */
const API_VERSION = 1;
const MAX_BODY = 12 * 1024 * 1024; // six compressed photos + three contract photos

type Fn = (opts: { data: unknown }) => Promise<unknown>;
const ACTIONS: Record<string, () => Promise<Fn>> = {
  "otp-send": async () => (await import("@/lib/whatsapp-otp.functions")).sendWhatsappOtp as unknown as Fn,
  "otp-check": async () => (await import("@/lib/whatsapp-otp.functions")).checkWhatsappLogin as unknown as Fn,
  "otp-verify": async () => (await import("@/lib/whatsapp-otp.functions")).verifyWhatsappOtp as unknown as Fn,
  "listing-submit": async () => (await import("@/lib/whatsapp-otp.functions")).submitOwnerListing as unknown as Fn,
  "assistant-ask": async () => (await import("@/lib/assistant.functions")).askAssistant as unknown as Fn,
  "assistant-browse": async () => (await import("@/lib/assistant.functions")).browseListings as unknown as Fn,
};

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export const Route = createFileRoute("/api/app/$action")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        if (params.action === "config") return json({ apiVersion: API_VERSION, actions: Object.keys(ACTIONS) });
        if (params.action === "assistant-info") {
          const { assistantInfo } = await import("@/lib/assistant.functions");
          return json(await (assistantInfo as unknown as () => Promise<unknown>)());
        }
        return json({ ok: false, error: "not_found" }, 404);
      },
      POST: async ({ request, params }) => {
        const load = ACTIONS[params.action];
        if (!load) return json({ ok: false, error: "not_found" }, 404);
        const size = Number(request.headers.get("content-length") ?? 0);
        if (size > MAX_BODY) return json({ ok: false, error: "too_large" }, 413);
        let body: unknown;
        try { body = await request.json(); } catch { return json({ ok: false, error: "bad_input" }, 400); }
        try {
          const fn = await load();
          return json(await fn({ data: body }));
        } catch (e) {
          // The same validators as the website reject bad input; anything else is logged, never echoed.
          const name = e instanceof Error ? e.name : "";
          if (name === "ZodError") return json({ ok: false, error: "bad_input" }, 400);
          const message = e instanceof Error ? e.message : String(e);
          console.error("app api", params.action, message);
          try {
            const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
            await db.rpc("log_app_error", { _kind: "server", _message: `app api ${params.action}: ${message}`.slice(0, 500), _stack: "", _path: `/api/app/${params.action}`, _ua: request.headers.get("user-agent")?.slice(0, 200) ?? "" });
          } catch { /* logging must never fail the request */ }
          return json({ ok: false, error: "server" }, 500);
        }
      },
    },
  },
});
