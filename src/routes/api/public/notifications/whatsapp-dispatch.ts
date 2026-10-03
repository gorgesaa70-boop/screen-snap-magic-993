import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/** Normalise to E.164 digits (Egypt local 01xxxxxxxxx -> 201xxxxxxxxx). */
function toDigits(v: string | null | undefined) {
  const d = (v ?? "").replace(/\D/g, "");
  if (/^01\d{9}$/.test(d)) return "2" + d;
  return /^\d{8,15}$/.test(d) ? d : null;
}

/**
 * Sends pending WhatsApp copies of notifications (new inquiry, broker reply) to users who opted in.
 * Called by a scheduler with the cron secret. Uses the Meta Cloud API creds already used for WhatsApp OTP
 * plus an approved UTILITY template in WHATSAPP_NOTIFY_TEMPLATE with 2 body variables ({{1}} title, {{2}} message).
 */
export const Route = createFileRoute("/api/public/notifications/whatsapp-dispatch")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        if (denied) return denied;

        const token = process.env["WHATSAPP_ACCESS_TOKEN"];
        const phoneId = process.env["WHATSAPP_PHONE_NUMBER_ID"];
        const template = process.env["WHATSAPP_NOTIFY_TEMPLATE"];
        const version = process.env["WHATSAPP_API_VERSION"] || "v21.0";
        const lang = process.env["WHATSAPP_TEMPLATE_LANG"] || "ar";
        const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");

        // Expire stale items so a late activation doesn't flood users.
        await db.from("notifications").update({ whatsapp_status: "skipped", whatsapp_error: "expired" })
          .eq("whatsapp_status", "pending").lt("created_at", new Date(Date.now() - 864e5).toISOString());

        if (!token || !phoneId || !template) {
          return Response.json({ configured: false, sent: 0 });
        }

        const { data: pending, error } = await db.from("notifications")
          .select("id, user_id, type, title, message").eq("whatsapp_status", "pending")
          .order("created_at").limit(50);
        if (error) return Response.json({ error: error.message }, { status: 500 });

        let sent = 0, skipped = 0, failed = 0;
        for (const n of pending ?? []) {
          const [{ data: pref }, { data: broker }] = await Promise.all([
            db.from("notification_preferences").select("*").eq("user_id", n.user_id).maybeSingle(),
            db.from("brokers").select("whatsapp, phone").eq("user_id", n.user_id).maybeSingle(),
          ]);
          const to = toDigits(pref?.whatsapp_phone) ?? toDigits(broker?.whatsapp) ?? toDigits(broker?.phone);
          if (!pref?.whatsapp_enabled || !pref.whatsapp_types.includes(n.type) || !to) {
            await db.from("notifications").update({ whatsapp_status: "skipped", whatsapp_error: !to ? "no_phone" : "opted_out" }).eq("id", n.id);
            skipped++; continue;
          }
          const res = await fetch(`https://graph.facebook.com/${version}/${phoneId}/messages`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              messaging_product: "whatsapp", to, type: "template",
              template: { name: template, language: { code: lang }, components: [{ type: "body", parameters: [
                { type: "text", text: n.title.slice(0, 200) }, { type: "text", text: (n.message || "-").slice(0, 500) },
              ] }] },
            }),
          });
          const body = await res.text();
          if (res.ok) {
            let mid: string | null = null;
            try { mid = JSON.parse(body).messages?.[0]?.id ?? null; } catch { /* ignore */ }
            await db.from("notifications").update({ whatsapp_status: "sent", whatsapp_sent_at: new Date().toISOString(), whatsapp_message_id: mid, whatsapp_error: null }).eq("id", n.id);
            sent++;
          } else {
            console.error(`WhatsApp notify failed [${res.status}]: ${body}`);
            await db.from("notifications").update({ whatsapp_status: "failed", whatsapp_error: `${res.status}: ${body.slice(0, 300)}` }).eq("id", n.id);
            failed++;
          }
        }
        return Response.json({ configured: true, sent, skipped, failed });
      },
    },
  },
});
