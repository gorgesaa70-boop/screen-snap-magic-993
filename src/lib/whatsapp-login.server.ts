import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { hmac, safeEqual } from "./otp-hash";
import { extractLoginCodes } from "./whatsapp-login";
import { sendWhatsappText } from "./whatsapp-send.server";

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
      await sendWhatsappText(phone, "تمام ✅ اتأكدنا من رقمك. ارجع لصفحة فاليو عقار، هتلاقي نفسك دخلت.\nDone ✅ Go back to Value Aqar.");
      return true;
    }
  }
  return false;
}
