import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { decideLogin, isPhoneTaken, type BrokerMatch } from "./broker-login";

// Limits (server-enforced; the UI mirrors them only for display)
const TTL_MS = 5 * 60 * 1000;
const RESEND_GAP_MS = 60 * 1000;
const MAX_SENDS_PER_PHONE = 4; // per 30 min
const PHONE_WINDOW_MS = 30 * 60 * 1000;
const MAX_SENDS_PER_IP = 15; // per hour
const MAX_ATTEMPTS = 5;

const phoneSchema = z.string().regex(/^[1-9]\d{7,14}$/);

const mask = (p: string) => `+${p.slice(0, 3)}****${p.slice(-3)}`;

async function hmac(value: string) {
  const pepper = process.env["WHATSAPP_OTP_PEPPER"];
  if (!pepper) throw new Error("pepper missing");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pepper), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

function clientIp() {
  return getRequestHeader("cf-connecting-ip") || getRequestHeader("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function log(event: string, phone: string | null, detail?: string, userId?: string | null) {
  const db = await admin();
  await db.from("auth_events").insert({ event, phone_masked: phone ? mask(phone) : null, detail: detail?.slice(0, 200) ?? null, user_id: userId ?? null });
}

type Result = { ok: true } | { ok: false; error: string; retryIn?: number };

export const sendWhatsappOtp = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ phone: phoneSchema }).parse(d))
  .handler(async ({ data }): Promise<Result> => {
    const token = process.env["WHATSAPP_ACCESS_TOKEN"];
    const phoneId = process.env["WHATSAPP_PHONE_NUMBER_ID"];
    const template = process.env["WHATSAPP_TEMPLATE_NAME"];
    const version = process.env["WHATSAPP_API_VERSION"] || "v21.0";
    const lang = process.env["WHATSAPP_TEMPLATE_LANG"] || "ar";
    if (!token || !phoneId || !template) return { ok: false, error: "not_configured" };

    const db = await admin();
    const phone = data.phone;
    const ipHash = await hmac("ip:" + clientIp());
    const now = Date.now();

    const { data: recent } = await db.from("whatsapp_otps").select("created_at")
      .eq("phone", phone).gte("created_at", new Date(now - PHONE_WINDOW_MS).toISOString())
      .order("created_at", { ascending: false });
    if (recent?.[0]) {
      const gap = now - new Date(recent[0].created_at).getTime();
      if (gap < RESEND_GAP_MS) return { ok: false, error: "too_soon", retryIn: Math.ceil((RESEND_GAP_MS - gap) / 1000) };
    }
    if ((recent?.length ?? 0) >= MAX_SENDS_PER_PHONE) { await log("wa_otp_rate_limited", phone, "phone limit"); return { ok: false, error: "rate_limited" }; }
    const { count: ipCount } = await db.from("whatsapp_otps").select("id", { count: "exact", head: true })
      .eq("ip_hash", ipHash).gte("created_at", new Date(now - 60 * 60 * 1000).toISOString());
    if ((ipCount ?? 0) >= MAX_SENDS_PER_IP) { await log("wa_otp_rate_limited", phone, "ip limit"); return { ok: false, error: "rate_limited" }; }

    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    const code = String(buf[0]! % 1_000_000).padStart(6, "0");

    const res = await fetch(`https://graph.facebook.com/${version}/${phoneId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp", to: phone, type: "template",
        template: { name: template, language: { code: lang }, components: [
          { type: "body", parameters: [{ type: "text", text: code }] },
          { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: code }] },
        ] },
      }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: { code?: number; message?: string } };
      console.error("WhatsApp send failed", res.status, body.error?.code, body.error?.message);
      await log("wa_otp_send_failed", phone, `meta ${res.status} ${body.error?.code ?? ""} ${body.error?.message ?? ""}`);
      return { ok: false, error: "send_failed" };
    }

    // invalidate older codes, store only the hash
    await db.from("whatsapp_otps").update({ consumed_at: new Date().toISOString() }).eq("phone", phone).is("consumed_at", null);
    await db.from("whatsapp_otps").insert({ phone, code_hash: await hmac(`${phone}:${code}`), expires_at: new Date(now + TTL_MS).toISOString(), ip_hash: ipHash });
    await log("wa_otp_sent", phone);
    return { ok: true };
  });

type VerifyResult = { ok: true; tokenHash: string } | { ok: false; error: string; remaining?: number };

export const verifyWhatsappOtp = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ phone: phoneSchema, code: z.string().regex(/^\d{6}$/) }).parse(d))
  .handler(async ({ data }): Promise<VerifyResult> => {
    const db = await admin();
    const { phone, code } = data;
    const r = await consumeCode(phone, code);
    if (!r.ok) return r;

    // Resolve the ORIGINAL account for this phone; never guess, never create a substitute for a broker
    const { brokers, authUserIds } = await lookupBrokerByPhone(phone);
    const decision = decideLogin(brokers, authUserIds);
    if (decision.kind === "conflict") { await log("wa_login_conflict", phone, decision.reason); return { ok: false, error: "conflict" }; }
    if (decision.kind === "suspended") { await log("wa_login_suspended", phone); return { ok: false, error: "banned" }; }

    const syntheticEmail = `wa-${phone}@phone.valueaqar.invalid`;
    let email: string;
    let userId: string;
    if (decision.kind === "user") {
      const { data: u, error } = await db.auth.admin.getUserById(decision.userId);
      if (error || !u.user) return { ok: false, error: "server" };
      userId = u.user.id;
      if (u.user.banned_until && new Date(u.user.banned_until).getTime() > Date.now()) return { ok: false, error: "banned" };
      email = u.user.email || syntheticEmail;
      if (!u.user.email) await db.auth.admin.updateUserById(userId, { email, email_confirm: true });
    } else {
      const { data: created, error } = await db.auth.admin.createUser({ phone, phone_confirm: true, email: syntheticEmail, email_confirm: true });
      if (error || !created.user) { console.error("createUser", error?.message); return { ok: false, error: "server" }; }
      userId = created.user.id;
      email = syntheticEmail;
    }
    const { data: link, error: linkErr } = await db.auth.admin.generateLink({ type: "magiclink", email });
    if (linkErr || !link.properties?.hashed_token) { console.error("generateLink", linkErr?.message); return { ok: false, error: "server" }; }
    await log("wa_otp_verified", phone, undefined, userId);
    return { ok: true, tokenHash: link.properties.hashed_token };
  });

/**
 * Server-only lookup of broker rows and auth users owning a phone (normalized in DB).
 * Uses service-only RPCs; results never leave the server (callers return only ok/error codes).
 */
async function lookupBrokerByPhone(phone: string): Promise<{ brokers: BrokerMatch[]; authUserIds: string[] }> {
  const db = await admin();
  const [{ data: bm, error: e1 }, { data: au, error: e2 }] = await Promise.all([
    db.rpc("brokers_by_phone", { _phone: phone }),
    db.rpc("auth_user_ids_by_phone", { _phone: phone }),
  ]);
  if (e1 || e2) throw new Error("lookup failed");
  return { brokers: (bm ?? []) as BrokerMatch[], authUserIds: (au ?? []) as unknown as string[] };
}

/** Consume a valid code for `phone` (shared by login and phone change). */
async function consumeCode(phone: string, code: string): Promise<{ ok: true } | { ok: false; error: string; remaining?: number }> {
  const db = await admin();
  const { data: row } = await db.from("whatsapp_otps").select("*")
    .eq("phone", phone).is("consumed_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!row || new Date(row.expires_at).getTime() < Date.now()) return { ok: false, error: "expired" };
  if (row.attempts >= MAX_ATTEMPTS) return { ok: false, error: "locked" };
  if (!safeEqual(row.code_hash, await hmac(`${phone}:${code}`))) {
    const attempts = row.attempts + 1;
    await db.from("whatsapp_otps").update({ attempts, ...(attempts >= MAX_ATTEMPTS ? { consumed_at: new Date().toISOString() } : {}) }).eq("id", row.id);
    await log(attempts >= MAX_ATTEMPTS ? "wa_otp_locked" : "wa_otp_failed", phone, "wrong code");
    return { ok: false, error: attempts >= MAX_ATTEMPTS ? "locked" : "wrong", remaining: MAX_ATTEMPTS - attempts };
  }
  const { data: consumed } = await db.from("whatsapp_otps").update({ consumed_at: new Date().toISOString() }).eq("id", row.id).is("consumed_at", null).select("id");
  return consumed?.length ? { ok: true } : { ok: false, error: "expired" };
}

const listingSchema = z.object({
  name: z.string().trim().min(2).max(100),
  phone: phoneSchema,
  code: z.string().regex(/^\d{6}$/).optional(),
  purpose: z.enum(["sale", "rent"]),
  property_type: z.string().trim().min(1).max(40),
  area: z.string().trim().max(80).optional(),
  asking_price: z.number().nonnegative().max(1e12).optional(),
  size_m2: z.number().positive().max(1e7).optional(),
  details: z.string().trim().max(1000).optional(),
});

/**
 * "بيع عقارك": an owner submits a property as a lead (kind 'listing').
 * When WhatsApp is configured the phone must be proven with a code; otherwise it is saved unverified.
 */
export const submitOwnerListing = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => listingSchema.parse(d))
  .handler(async ({ data }): Promise<{ ok: true } | { ok: false; error: string; remaining?: number }> => {
    const waReady = !!(process.env["WHATSAPP_ACCESS_TOKEN"] && process.env["WHATSAPP_PHONE_NUMBER_ID"] && process.env["WHATSAPP_TEMPLATE_NAME"]);
    if (waReady) {
      if (!data.code) return { ok: false, error: "code_required" };
      const r = await consumeCode(data.phone, data.code);
      if (!r.ok) return r;
    }
    const db = await admin();
    const { error } = await db.from("leads").insert({
      kind: "listing", name: data.name, phone: data.phone, phone_verified: waReady,
      purpose: data.purpose, property_type: data.property_type, area: data.area || null,
      asking_price: data.asking_price ?? null, size_m2: data.size_m2 ?? null, details: data.details || null,
    });
    if (error) { console.error("owner listing insert", error.code); return { ok: false, error: "server" }; }
    return { ok: true };
  });

/**
 * Change the signed-in user's login phone. Ownership proof = active session (old account)
 * + valid WhatsApp code sent to the NEW number. Rejected if the number belongs to anyone else.
 */
export const changePhoneWithWhatsapp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ phone: phoneSchema, code: z.string().regex(/^\d{6}$/) }).parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true } | { ok: false; error: string; remaining?: number }> => {
    const userId = (context as { userId: string }).userId;
    const r = await consumeCode(data.phone, data.code);
    if (!r.ok) return r;
    const db = await admin();
    const { brokers, authUserIds } = await lookupBrokerByPhone(data.phone);
    const taken = isPhoneTaken(brokers, authUserIds, userId);
    if (taken) { await log("wa_phone_change_conflict", data.phone, undefined, userId); return { ok: false, error: "phone_taken" }; }
    const { error } = await db.auth.admin.updateUserById(userId, { phone: data.phone, phone_confirm: true });
    if (error) { console.error("phone change", error.message); return { ok: false, error: "server" }; }
    await db.from("brokers").update({ phone: data.phone }).eq("user_id", userId);
    await log("wa_phone_changed", data.phone, undefined, userId);
    return { ok: true };
  });
