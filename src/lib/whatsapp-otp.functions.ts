import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { decideLogin, isPhoneTaken, type BrokerMatch } from "./broker-login";
import { hmac, safeEqual } from "./otp-hash";

// Limits (server-enforced; the UI mirrors them only for display)
const TTL_MS = 5 * 60 * 1000;
const INBOUND_TTL_MS = 10 * 60 * 1000; // time to switch to WhatsApp, send, and come back
const RESEND_GAP_MS = 60 * 1000;
const MAX_SENDS_PER_PHONE = 4; // per 30 min
const PHONE_WINDOW_MS = 30 * 60 * 1000;
const MAX_SENDS_PER_IP = 15; // per hour
const MAX_ATTEMPTS = 5;

const phoneSchema = z.string().regex(/^[1-9]\d{7,14}$/);

const mask = (p: string) => `+${p.slice(0, 3)}****${p.slice(-3)}`;

const ticketSchema = z.string().regex(/^[0-9a-f]{64}$/);

/**
 * Two ways to prove a WhatsApp number:
 * - "inbound" (default): the site shows a code and the customer sends it to Value Aqar's number; the webhook confirms
 *   it (no message template needed, free). Needs the webhook (WHATSAPP_APP_SECRET).
 * - "template" (WHATSAPP_LOGIN_MODE=template): Value Aqar sends the code with an approved authentication template.
 */
const inboundMode = () => process.env["WHATSAPP_LOGIN_MODE"] !== "template";
const waReady = () => !!process.env["WHATSAPP_OTP_PEPPER"] && (inboundMode()
  ? !!process.env["WHATSAPP_APP_SECRET"]
  : !!(process.env["WHATSAPP_ACCESS_TOKEN"] && process.env["WHATSAPP_PHONE_NUMBER_ID"] && process.env["WHATSAPP_TEMPLATE_NAME"]));

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

type Result =
  | { ok: true; mode: "template" }
  | { ok: true; mode: "inbound"; code: string; ticket: string; expiresIn: number }
  | { ok: false; error: string; retryIn?: number };

export const sendWhatsappOtp = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ phone: phoneSchema }).parse(d))
  .handler(async ({ data }): Promise<Result> => {
    const token = process.env["WHATSAPP_ACCESS_TOKEN"];
    const phoneId = process.env["WHATSAPP_PHONE_NUMBER_ID"];
    const template = process.env["WHATSAPP_TEMPLATE_NAME"];
    const version = process.env["WHATSAPP_API_VERSION"] || "v21.0";
    const lang = process.env["WHATSAPP_TEMPLATE_LANG"] || "ar";
    if (!waReady()) return { ok: false, error: "not_configured" };

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

    if (inboundMode()) {
      // Nothing is sent: the browser shows the code and the customer sends it to us from WhatsApp.
      const t = new Uint8Array(32);
      crypto.getRandomValues(t);
      const ticket = Array.from(t).map((b) => b.toString(16).padStart(2, "0")).join("");
      await db.from("whatsapp_otps").update({ consumed_at: new Date().toISOString() }).eq("phone", phone).is("consumed_at", null);
      await db.from("whatsapp_otps").insert({ phone, code_hash: await hmac(`${phone}:${code}`), ticket_hash: await hmac(`ticket:${ticket}`),
        expires_at: new Date(now + INBOUND_TTL_MS).toISOString(), ip_hash: ipHash });
      await log("wa_otp_sent", phone, "inbound code shown");
      return { ok: true, mode: "inbound", code, ticket, expiresIn: INBOUND_TTL_MS / 1000 };
    }
    if (!token || !phoneId || !template) return { ok: false, error: "not_configured" };

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
    return { ok: true, mode: "template" };
  });

/** Polled by the browser that started an inbound sign-in: has the customer's WhatsApp message arrived? */
export const checkWhatsappLogin = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ phone: phoneSchema, ticket: ticketSchema }).parse(d))
  .handler(async ({ data }): Promise<{ status: "pending" | "confirmed" | "expired" }> => {
    const db = await admin();
    const { data: row } = await db.from("whatsapp_otps").select("expires_at, confirmed_at, consumed_at")
      .eq("phone", data.phone).eq("ticket_hash", await hmac(`ticket:${data.ticket}`)).maybeSingle();
    if (!row || row.consumed_at || new Date(row.expires_at).getTime() < Date.now()) return { status: "expired" };
    return { status: row.confirmed_at ? "confirmed" : "pending" };
  });

/** A phone plus its proof: the code the customer received (template) or the ticket of a confirmed inbound sign-in. */
const proofSchema = z.object({ phone: phoneSchema, code: z.string().regex(/^\d{6}$/).optional(), ticket: ticketSchema.optional() })
  .refine((d) => !!d.code !== !!d.ticket, "code or ticket");

type VerifyResult = { ok: true; tokenHash: string } | { ok: false; error: string; remaining?: number };

export const verifyWhatsappOtp = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => proofSchema.parse(d))
  .handler(async ({ data }): Promise<VerifyResult> => {
    const db = await admin();
    const { phone } = data;
    const r = await consumeProof(data);
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

/** Consume a code or a confirmed inbound ticket for `phone` (shared by login, phone change and owner listings). */
async function consumeProof(p: { phone: string; code?: string | undefined; ticket?: string | undefined }): Promise<{ ok: true } | { ok: false; error: string; remaining?: number }> {
  if (p.code) return consumeCode(p.phone, p.code);
  const db = await admin();
  const { data: row } = await db.from("whatsapp_otps").select("id, expires_at, confirmed_at, consumed_at")
    .eq("phone", p.phone).eq("ticket_hash", await hmac(`ticket:${p.ticket}`)).maybeSingle();
  if (!row || row.consumed_at || new Date(row.expires_at).getTime() < Date.now()) return { ok: false, error: "expired" };
  if (!row.confirmed_at) return { ok: false, error: "not_confirmed" };
  const { data: consumed } = await db.from("whatsapp_otps").update({ consumed_at: new Date().toISOString() }).eq("id", row.id).is("consumed_at", null).select("id");
  return consumed?.length ? { ok: true } : { ok: false, error: "expired" };
}

/** Typed code from a template message; inbound sign-ins (with a ticket) can't be used this way. */
async function consumeCode(phone: string, code: string): Promise<{ ok: true } | { ok: false; error: string; remaining?: number }> {
  const db = await admin();
  const { data: row } = await db.from("whatsapp_otps").select("*")
    .eq("phone", phone).is("consumed_at", null).is("ticket_hash", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
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

const MAX_LISTING_PHOTOS = 6;
const MAX_PHOTO_BYTES = 1_500_000;
const MAX_LISTINGS_PER_PHONE_PER_DAY = 3;

const listingSchema = z.object({
  name: z.string().trim().min(2).max(100),
  phone: phoneSchema,
  code: z.string().regex(/^\d{6}$/).optional(),
  ticket: ticketSchema.optional(),
  purpose: z.enum(["sale", "rent", "summer"]),
  // Summer listings: what the asking price is per (defaults to a night).
  price_unit: z.enum(["night", "week", "month", "season"]).optional(),
  property_type: z.string().trim().min(1).max(40),
  city: z.string().trim().min(2).max(60),
  area: z.string().trim().min(2).max(60),
  asking_price: z.number().positive().max(1e12),
  size_m2: z.number().positive().max(1e7),
  finishing: z.enum(["skeleton", "semi", "full", "super_lux"]).optional(),
  payment_method: z.enum(["cash", "installment", "both"]).optional(),
  down_payment: z.number().min(0).max(1e12).optional(),
  installment_years: z.number().int().min(1).max(30).optional(),
  monthly_installment: z.number().positive().max(1e12).optional(),
  installment_note: z.string().trim().max(500).optional(),
  rooms: z.number().int().min(0).max(50).optional(),
  baths: z.number().int().min(0).max(50).optional(),
  floor: z.string().trim().max(50).optional(),
  details: z.string().trim().max(3000).optional(),
  // JPEG images, base64 without the data: prefix (the browser resizes them first)
  photos: z.array(z.string().max(Math.ceil((MAX_PHOTO_BYTES * 4) / 3) + 4)).max(MAX_LISTING_PHOTOS).default([]),
  // Optional map pin, limited to Egypt.
  lat: z.number().min(22).max(32).optional(),
  lng: z.number().min(24).max(37).optional(),
  // Ad / campaign that brought the owner (item 30); the database maps it to the lead source.
  utm: z.record(z.string().max(30), z.string().max(120)).optional(),
});

function decodeJpeg(b64: string): Uint8Array | null {
  try {
    const bin = atob(b64);
    if (bin.length > MAX_PHOTO_BYTES) return null;
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff ? bytes : null;
  } catch {
    return null;
  }
}

/**
 * "بيع عقارك": an owner submits a property with photos. It is saved as a hidden 'pending' property
 * (approved later by an admin) plus a 'listing' lead holding the owner's private contact details.
 * When WhatsApp is configured the phone must be proven with a code; otherwise it is saved unverified.
 */
export const submitOwnerListing = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => listingSchema.parse(d))
  .handler(async ({ data }): Promise<{ ok: true } | { ok: false; error: string; remaining?: number }> => {
    const photos = data.photos.map(decodeJpeg);
    if (photos.some((p) => !p)) return { ok: false, error: "bad_photo" };

    const verified = waReady();
    if (verified) {
      if (!data.code && !data.ticket) return { ok: false, error: "code_required" };
      const r = await consumeProof(data);
      if (!r.ok) return r;
    }
    const db = await admin();
    const { count } = await db.from("leads").select("id", { count: "exact", head: true })
      .eq("kind", "listing").eq("phone", data.phone).gte("created_at", new Date(Date.now() - 864e5).toISOString());
    if ((count ?? 0) >= MAX_LISTINGS_PER_PHONE_PER_DAY) return { ok: false, error: "rate_limited" };
    // The owner's plan: how many listings can be up at once for this phone (the free owner plan allows 2).
    const { data: quota } = await db.rpc("owner_listing_quota", { _phone: data.phone });
    const q = quota as { used: number; max: number } | null;
    if (q && q.used >= q.max) return { ok: false, error: "plan_limit" };

    const status = data.purpose === "rent" ? "إيجار" : data.purpose === "summer" ? "مصيف" : "بيع";
    const summerPrice = data.purpose === "summer" ? { [`price_${data.price_unit ?? "night"}`]: data.asking_price } : {};
    const place = data.area === data.city ? data.city : `${data.area}، ${data.city}`;
    const { data: lead, error: leadErr } = await db.from("leads").insert({
      kind: "listing", name: data.name, phone: data.phone, phone_verified: verified,
      purpose: data.purpose, property_type: data.property_type, area: place,
      asking_price: data.asking_price, size_m2: data.size_m2, details: data.details || null, original_source: "website", utm: data.utm ?? null,
    }).select("id").single();
    if (leadErr || !lead) { console.error("owner listing lead", leadErr?.code); return { ok: false, error: "server" }; }

    const urls: string[] = [];
    for (const [i, bytes] of photos.entries()) {
      const path = `owners/${lead.id}/${i + 1}.jpg`;
      const { error: upErr } = await db.storage.from("media").upload(path, bytes!, { contentType: "image/jpeg", upsert: true });
      if (upErr) { console.error("owner photo upload", upErr.message); continue; }
      const { data: signed } = await db.storage.from("media").createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
      if (signed?.signedUrl) urls.push(signed.signedUrl);
    }

    const { error: propErr } = await db.from("properties").insert({
      broker_id: null, owner_lead_id: lead.id, review_status: "pending", category: "residential",
      title: `${data.property_type} ${status === "مصيف" ? "للمصيف" : `لل${status}`} في ${place}`.slice(0, 150),
      description: data.details || null, price: data.asking_price, type: data.property_type, status,
      city: data.city, area: data.area, size: data.size_m2, finishing: data.property_type === "أرض" ? null : data.finishing ?? null, rooms: data.rooms ?? null, baths: data.baths ?? null,
      floor: data.floor || null, image_url: urls[0] ?? null, images: urls, ...summerPrice,
      ...(status === "بيع" && data.payment_method ? {
        payment_method: data.payment_method, down_payment: data.down_payment ?? null, installment_years: data.installment_years ?? null,
        monthly_installment: data.monthly_installment ?? null, installment_note: data.installment_note || null,
      } : {}),
      lat: data.lat ?? null, lng: data.lng ?? null,
    });
    // The lead is already saved, so the team can still follow up if this fails.
    if (propErr) console.error("owner listing property", propErr.code, propErr.message);
    return { ok: true };
  });

/**
 * Change the signed-in user's login phone. Ownership proof = active session (old account)
 * + valid WhatsApp code sent to the NEW number. Rejected if the number belongs to anyone else.
 */
export const changePhoneWithWhatsapp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => proofSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true } | { ok: false; error: string; remaining?: number }> => {
    const userId = (context as { userId: string }).userId;
    const r = await consumeProof(data);
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
