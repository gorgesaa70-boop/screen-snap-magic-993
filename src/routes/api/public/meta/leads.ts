import { createFileRoute } from "@tanstack/react-router";
import { verifyChallenge, verifySignature } from "@/lib/whatsapp-webhook";
import { mapGraphLead, parseLeadgen, type GraphLead } from "@/lib/meta-leads";

/**
 * Meta Lead Ads webhook (Page → leadgen). Each announced lead is fetched from the Graph API with the Page token
 * and imported once through meta_inbound_lead() (source Facebook / Instagram + campaign + ad).
 * Secrets: META_PAGE_ACCESS_TOKEN; META_APP_SECRET / META_VERIFY_TOKEN (fall back to the WhatsApp app's values).
 */
const appSecret = () => process.env["META_APP_SECRET"] || process.env["WHATSAPP_APP_SECRET"];
const verifyToken = () => process.env["META_VERIFY_TOKEN"] || process.env["WHATSAPP_VERIFY_TOKEN"];

export const Route = createFileRoute("/api/public/meta/leads")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const challenge = verifyChallenge(new URL(request.url).searchParams, verifyToken());
        return challenge
          ? new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } })
          : new Response("Forbidden", { status: 403 });
      },
      POST: async ({ request }) => {
        const raw = await request.text();
        if (raw.length > 1_000_000) return new Response("Too large", { status: 413 });
        if (!(await verifySignature(raw, request.headers.get("x-hub-signature-256"), appSecret()))) return new Response("Invalid signature", { status: 401 });
        let payload: unknown;
        try { payload = JSON.parse(raw); } catch { return new Response("Bad JSON", { status: 400 }); }
        const ids = parseLeadgen(payload).slice(0, 50);
        const token = process.env["META_PAGE_ACCESS_TOKEN"];
        if (!ids.length) return new Response("ok");
        if (!token) { console.error("meta leads: META_PAGE_ACCESS_TOKEN missing"); return new Response("ok"); }

        const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
        for (const id of ids) {
          const res = await fetch(`https://graph.facebook.com/v21.0/${id}?fields=id,field_data,campaign_name,ad_name,platform`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => null);
          if (!res?.ok) { console.error("meta leads: graph fetch failed", res?.status); continue; }
          const lead = mapGraphLead((await res.json()) as GraphLead);
          if (!lead._ref) continue;
          const { data, error } = await db.rpc("meta_inbound_lead", lead);
          if (error) console.error("meta leads: import failed", error.code);
          else if (data === "no_phone") console.error("meta leads: form has no phone field", id);
        }
        return new Response("ok");
      },
    },
  },
});
