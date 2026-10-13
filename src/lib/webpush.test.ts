import { describe, expect, it } from "vitest";
import { b64url, encryptPayload, fromB64url, generateVapidKeys, sendPush } from "./webpush";

const te = new TextEncoder();
const concat = (...p: Uint8Array[]): Uint8Array<ArrayBuffer> => { const o = new Uint8Array(p.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of p) { o.set(x, i); i += x.length; } return o; };
async function hkdf(salt: Uint8Array<ArrayBuffer>, ikm: Uint8Array<ArrayBuffer>, info: Uint8Array<ArrayBuffer>, n: number) {
  const k = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, k, n * 8));
}

/** A browser's side of RFC 8291: makes a subscription and decrypts what the server sends. */
async function fakeBrowser() {
  const kp = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
  const uaPublic = new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey));
  const auth = crypto.getRandomValues(new Uint8Array(16));
  return {
    p256dh: b64url(uaPublic), auth: b64url(auth),
    async decrypt(body: Uint8Array) {
      const salt = body.slice(0, 16);
      const idlen = body[20]!;
      const asPublic = body.slice(21, 21 + idlen);
      const cipher = body.slice(21 + idlen);
      const asKey = await crypto.subtle.importKey("raw", asPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
      const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: asKey }, kp.privateKey, 256));
      const ikm = await hkdf(auth, shared, concat(te.encode("WebPush: info\0"), uaPublic, asPublic), 32);
      const cek = await hkdf(salt, ikm, te.encode("Content-Encoding: aes128gcm\0"), 16);
      const nonce = await hkdf(salt, ikm, te.encode("Content-Encoding: nonce\0"), 12);
      const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["decrypt"]);
      const plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, key, cipher));
      expect(plain[plain.length - 1]).toBe(2);
      return new TextDecoder().decode(plain.slice(0, -1));
    },
  };
}

describe("web push", () => {
  it("encrypts a message only the subscribed browser can read", async () => {
    const browser = await fakeBrowser();
    const msg = JSON.stringify({ title: "رسالة جديدة", body: "شركة النخبة: أهلا بحضرتك", url: "/messages" });
    const body = await encryptPayload(te.encode(msg), browser.p256dh, browser.auth);
    expect(Array.from(body.slice(16, 20))).toEqual([0, 0, 0x10, 0]);
    expect(await browser.decrypt(body)).toBe(msg);
    // Same message twice gives different bytes (fresh salt and key each time).
    const again = await encryptPayload(te.encode(msg), browser.p256dh, browser.auth);
    expect(b64url(again)).not.toBe(b64url(body));
  });

  it("signs the VAPID header with the site key, for the push service's origin", async () => {
    const keys = await generateVapidKeys();
    expect(fromB64url(keys.publicKey).length).toBe(65);
    const browser = await fakeBrowser();
    let captured: { url: string; headers: Record<string, string>; body: Uint8Array } | null = null;
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      captured = { url, headers: init.headers as Record<string, string>, body: init.body as Uint8Array };
      return new Response(null, { status: 201 });
    }) as typeof fetch;
    try {
      const status = await sendPush({ endpoint: "https://fcm.googleapis.com/fcm/send/abc", ...browser }, { title: "t", body: "b", url: "/" }, keys, "mailto:info@valueaqar.com");
      expect(status).toBe(201);
    } finally {
      globalThis.fetch = realFetch;
    }
    const c = captured!;
    expect(c.headers["Content-Encoding"]).toBe("aes128gcm");
    const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(c.headers["Authorization"]!)!;
    expect(m[4]).toBe(keys.publicKey);
    const claims = JSON.parse(new TextDecoder().decode(fromB64url(m[2]!)));
    expect(claims.aud).toBe("https://fcm.googleapis.com");
    expect(claims.sub).toBe("mailto:info@valueaqar.com");
    expect(claims.exp).toBeGreaterThan(Date.now() / 1000);
    const pub = await crypto.subtle.importKey("raw", fromB64url(keys.publicKey), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    const ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pub, fromB64url(m[3]!), te.encode(`${m[1]}.${m[2]}`));
    expect(ok).toBe(true);
    expect(JSON.parse(await browser.decrypt(c.body))).toEqual({ title: "t", body: "b", url: "/" });
  });
});
