import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { hmac, safeEqual } from "./otp-hash";
import { extractLoginCodes } from "./whatsapp-login";

/**
 * Webhook side of "send us the code" sign-in: a WhatsApp message from `phone` that contains the code of one of its
 * open sign-ins marks that sign-in confirmed. Returns true when the message was a sign-in code (it is then not a lead).
 */
export async function confirmInboundLogin(db: SupabaseClient<Database>, phone: string, text: string | null): Promise<boolean> {
  const codes = extractLoginCodes(text);
  if (!codes.length) return false;
  const { data: rows } = await db.from("whatsapp_otps").select("id, code_hash")
    .eq("phone", phone).not("ticket_hash", "is", null).is("confirmed_at", null).is("consumed_at", null)
    .gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }).limit(3);
  for (const row of rows ?? []) {
    for (const code of codes) {
      if (!safeEqual(row.code_hash, await hmac(`${phone}:${code}`))) continue;
      await db.from("whatsapp_otps").update({ confirmed_at: new Date().toISOString() }).eq("id", row.id).is("confirmed_at", null);
      await db.from("auth_events").insert({ event: "wa_otp_verified", phone_masked: `+${phone.slice(0, 3)}****${phone.slice(-3)}`, detail: "inbound code received" });
      await replyText(phone, "تمام ✅ اتأكدنا من رقمك. ارجع لصفحة فاليو عقار، هتلاقي نفسك دخلت.\nDone ✅ Go back to Value Aqar.");
      return true;
    }
  }
  return false;
}

/** Free-form reply inside the 24-hour window the customer just opened (no template needed). Best effort. */
async function replyText(to: string, body: string) {
  const token = process.env["WHATSAPP_ACCESS_TOKEN"];
  const phoneId = process.env["WHATSAPP_PHONE_NUMBER_ID"];
  const version = process.env["WHATSAPP_API_VERSION"] || "v21.0";
  if (!token || !phoneId) return;
  const res = await fetch(`https://graph.facebook.com/${version}/${phoneId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body } }),
  }).catch(() => null);
  if (res && !res.ok) {
    // Meta's own reason (code + message, never the token) so a refused reply can be fixed from the logs.
    const err = (await res.json().catch(() => null) as { error?: { code?: number; error_subcode?: number; message?: string; error_data?: { details?: string } } } | null)?.error;
    console.error("wa login reply failed", res.status, err?.code, err?.error_subcode ?? "", (err?.error_data?.details ?? err?.message ?? "").slice(0, 200));
  }
}
