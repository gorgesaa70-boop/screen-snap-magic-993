/**
 * Firebase Cloud Messaging (HTTP v1) for the native app — Android directly, iPhone through Firebase's APNs link.
 * Off until the FIREBASE_SERVICE_ACCOUNT secret (the service-account JSON) is set; no SDK, just WebCrypto + fetch.
 */
type ServiceAccount = { project_id: string; client_email: string; private_key: string };

export function fcmAccount(): ServiceAccount | null {
  const raw = process.env["FIREBASE_SERVICE_ACCOUNT"];
  if (!raw) return null;
  try {
    const sa = JSON.parse(raw) as Partial<ServiceAccount>;
    return sa.project_id && sa.client_email && sa.private_key ? (sa as ServiceAccount) : null;
  } catch {
    return null;
  }
}

const b64url = (bytes: Uint8Array | string) => {
  const bin = typeof bytes === "string" ? unescape(encodeURIComponent(bytes)) : String.fromCharCode(...bytes);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

function pemToDer(pem: string): ArrayBuffer {
  const b64 = pem.replace(/-----[^-]+-----/g, "").replace(/\\n|\s/g, "");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

let cached: { token: string; exp: number; email: string } | null = null;

/** A Google OAuth token for FCM, reused until a minute before it expires. */
async function accessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.email === sa.client_email && cached.exp - 60 > now) return cached.token;
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({
    iss: sa.client_email, scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600,
  }));
  const key = await crypto.subtle.importKey("pkcs8", pemToDer(sa.private_key), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${header}.${claims}`)));
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${header}.${claims}.${b64url(sig)}` }),
  });
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string };
  if (!res.ok || !body.access_token) throw new Error(`fcm oauth ${res.status} ${body.error ?? ""}`);
  cached = { token: body.access_token, exp: now + (body.expires_in ?? 3600), email: sa.client_email };
  return body.access_token;
}

export type FcmResult = "ok" | "gone" | "error";

/** One message to one device. "gone" = the app was uninstalled or the token expired: forget the device. */
export async function sendFcm(sa: ServiceAccount, token: string, msg: { title: string; body: string; url: string; tag: string }): Promise<FcmResult> {
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await accessToken(sa)}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        token,
        notification: { title: msg.title.slice(0, 200), body: msg.body.slice(0, 1000) },
        data: { url: msg.url, tag: msg.tag },
        android: { priority: "high", notification: { tag: msg.tag, channel_id: "default" } },
        apns: { payload: { aps: { sound: "default", "thread-id": msg.tag } } },
      },
    }),
  });
  if (res.ok) return "ok";
  const err = (await res.json().catch(() => ({}))) as { error?: { status?: string; details?: { errorCode?: string }[] } };
  const code = err.error?.details?.find((d) => d.errorCode)?.errorCode ?? err.error?.status ?? "";
  if (res.status === 404 || code === "UNREGISTERED" || (res.status === 400 && code === "INVALID_ARGUMENT")) return "gone";
  return "error";
}
