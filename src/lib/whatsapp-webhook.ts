// Pure helpers for the WhatsApp Cloud API webhook (no secrets, no DB) — unit-testable.

export function verifyChallenge(params: URLSearchParams, verifyToken: string | undefined): string | null {
  if (!verifyToken) return null;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token") ?? "";
  const challenge = params.get("hub.challenge");
  if (mode !== "subscribe" || !challenge || !safeEqual(token, verifyToken)) return null;
  return challenge;
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export async function verifySignature(rawBody: string, header: string | null, appSecret: string | undefined): Promise<boolean> {
  if (!appSecret || !header?.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(appSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const hex = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return safeEqual(header.slice(7).toLowerCase(), hex);
}

export function maskPhone(p: string | undefined | null) {
  const d = (p ?? "").replace(/\D/g, "");
  return d.length < 6 ? null : d.slice(0, 3) + "*".repeat(d.length - 5) + d.slice(-2);
}

export type WebhookEvent = {
  event_key: string;
  kind: "message" | "status";
  wa_message_id: string | null;
  status: string | null;
  from_masked: string | null;
  message_type: string | null;
  error_code: string | null;
  error_title: string | null;
  event_at: string | null;
};

const ts = (t: unknown) => (t && /^\d+$/.test(String(t)) ? new Date(Number(t) * 1000).toISOString() : null);

/** Extracts events without message bodies or full phone numbers. */
export function parseEvents(payload: unknown): WebhookEvent[] {
  const out: WebhookEvent[] = [];
  const p = payload as { object?: string; entry?: { changes?: { field?: string; value?: any }[] }[] };
  if (p?.object !== "whatsapp_business_account" || !Array.isArray(p.entry)) return out;
  for (const e of p.entry) for (const c of e?.changes ?? []) {
    if (c?.field !== "messages") continue;
    const v = c.value ?? {};
    for (const m of v.messages ?? []) {
      if (!m?.id) continue;
      out.push({ event_key: `msg:${m.id}`, kind: "message", wa_message_id: String(m.id), status: null,
        from_masked: maskPhone(m.from), message_type: m.type ? String(m.type).slice(0, 40) : null,
        error_code: null, error_title: null, event_at: ts(m.timestamp) });
    }
    for (const s of v.statuses ?? []) {
      if (!s?.id || !s?.status) continue;
      const err = s.errors?.[0];
      out.push({ event_key: `st:${s.id}:${s.status}`, kind: "status", wa_message_id: String(s.id),
        status: String(s.status).slice(0, 20), from_masked: maskPhone(s.recipient_id), message_type: null,
        error_code: err?.code != null ? String(err.code) : null, error_title: err?.title ? String(err.title).slice(0, 200) : null,
        event_at: ts(s.timestamp) });
    }
  }
  return out;
}
