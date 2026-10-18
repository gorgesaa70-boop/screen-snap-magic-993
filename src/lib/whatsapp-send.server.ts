/**
 * Free-form WhatsApp text from the API number. Only works inside the 24-hour window that the customer's last message
 * opened (no template needed, and Meta doesn't charge for it). Never throws.
 */
export async function sendWhatsappText(to: string, body: string): Promise<{ ok: true; id: string | null } | { ok: false; error: string }> {
  const token = process.env["WHATSAPP_ACCESS_TOKEN"];
  const phoneId = process.env["WHATSAPP_PHONE_NUMBER_ID"];
  const version = process.env["WHATSAPP_API_VERSION"] || "v21.0";
  if (!token || !phoneId) return { ok: false, error: "not_configured" };
  const res = await fetch(`https://graph.facebook.com/${version}/${phoneId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body: body.slice(0, 4000), preview_url: true } }),
  }).catch(() => null);
  if (!res) return { ok: false, error: "network" };
  const json = (await res.json().catch(() => null)) as
    | { messages?: { id?: string }[]; error?: { code?: number; error_subcode?: number; message?: string; error_data?: { details?: string } } }
    | null;
  if (!res.ok) {
    const err = json?.error;
    // Meta's own reason (code + message, never the token) so a refused message can be fixed from the logs.
    console.error("wa send failed", res.status, err?.code, err?.error_subcode ?? "", (err?.error_data?.details ?? err?.message ?? "").slice(0, 200));
    return { ok: false, error: `meta_${err?.code ?? res.status}` };
  }
  return { ok: true, id: json?.messages?.[0]?.id ?? null };
}
