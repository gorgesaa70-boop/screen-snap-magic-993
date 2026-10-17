import { createFileRoute } from "@tanstack/react-router";
import { parseEvents, parseInbound, verifyChallenge, verifySignature } from "@/lib/whatsapp-webhook";

/** Meta WhatsApp Cloud API webhook. Independent from OTP/dispatch code. */
export const Route = createFileRoute("/api/public/whatsapp/webhook")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const challenge = verifyChallenge(new URL(request.url).searchParams, process.env["WHATSAPP_VERIFY_TOKEN"]);
        return challenge
          ? new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } })
          : new Response("Forbidden", { status: 403 });
      },
      POST: async ({ request }) => {
        const raw = await request.text();
        if (raw.length > 1_000_000) return new Response("Too large", { status: 413 });
        const ok = await verifySignature(raw, request.headers.get("x-hub-signature-256"), process.env["WHATSAPP_APP_SECRET"]);
        if (!ok) return new Response("Invalid signature", { status: 401 });

        let payload: unknown;
        try { payload = JSON.parse(raw); } catch { return new Response("Bad JSON", { status: 400 }); }
        const events = parseEvents(payload);
        if (!events.length) return new Response("ok");

        const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
        // Unique event_key + ignoreDuplicates => each event processed once.
        const { data: inserted, error } = await db.from("whatsapp_webhook_events")
          .upsert(events, { onConflict: "event_key", ignoreDuplicates: true }).select("kind, wa_message_id, status, error_code, error_title");
        if (error) { console.error("wa webhook insert failed", error.code); return new Response("error", { status: 500 }); }

        // Only newly inserted status events update the matching notification copy.
        for (const ev of inserted ?? []) {
          if (ev.kind !== "status" || !ev.wa_message_id) continue;
          if (ev.status === "failed") {
            await db.from("notifications").update({ whatsapp_status: "failed", whatsapp_error: `meta_${ev.error_code ?? "unknown"}` }).eq("whatsapp_message_id", ev.wa_message_id);
          } else if (ev.status === "delivered" || ev.status === "read") {
            await db.from("notifications").update({ whatsapp_status: ev.status }).eq("whatsapp_message_id", ev.wa_message_id).neq("whatsapp_status", "read");
          }
        }
        // Newly received customer messages: a new number becomes a lead (source WhatsApp), a known customer gets a note.
        // A sign-in code sent from the same number confirms that sign-in instead.
        const fresh = new Set((inserted ?? []).filter((ev) => ev.kind === "message" && ev.wa_message_id).map((ev) => ev.wa_message_id));
        const { confirmInboundLogin } = await import("@/lib/whatsapp-login.server");
        for (const m of parseInbound(payload)) {
          if (!fresh.has(m.wa_message_id)) continue;
          const isLogin = await confirmInboundLogin(db, m.phone, m.text).catch((e: Error) => { console.error("wa login confirm failed", e.message); return false; });
          if (isLogin) continue;
          const { error: leadErr } = await db.rpc("whatsapp_inbound_lead", { _phone: m.phone, _name: m.name ?? "", _text: m.text ?? "", _msg_id: m.wa_message_id });
          if (leadErr) console.error("wa inbound lead failed", leadErr.code);
        }
        return new Response("ok");
      },
    },
  },
});
