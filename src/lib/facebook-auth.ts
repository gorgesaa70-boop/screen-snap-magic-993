/**
 * «المتابعة بحساب Facebook». Lovable Cloud's managed sign-in has no Facebook, so the site runs the OAuth itself
 * (like the WhatsApp sign-in): /api/public/auth/facebook/start → Facebook → /api/public/auth/facebook/callback, which
 * signs the person in to their account (same e-mail = same account) and hands a one-time token to /auth-facebook.
 * Needs the secrets FACEBOOK_APP_ID and FACEBOOK_APP_SECRET, and «Facebook Login» on the Meta app with the callback
 * below as a valid redirect URI.
 */

export const FB_GRAPH = "https://graph.facebook.com/v21.0";
export const FB_STATE_COOKIE = "va_fb_state";
export const FB_CALLBACK_PATH = "/api/public/auth/facebook/callback";
/** Where the browser finishes signing in (token in the URL fragment, so it never reaches a server log). */
export const FB_FINISH_PATH = "/auth-facebook";

/** The site's public address for this request (behind the host's proxy the request URL can be an internal one). */
export function publicOrigin(request: Request) {
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || url.host;
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
  return `${local ? url.protocol : "https:"}//${host}`;
}

export function facebookDialogUrl(appId: string, redirectUri: string, state: string) {
  const q = new URLSearchParams({ client_id: appId, redirect_uri: redirectUri, state, scope: "public_profile,email", response_type: "code" });
  return `https://www.facebook.com/v21.0/dialog/oauth?${q}`;
}

/** Facebook accounts without an e-mail (signed up by phone) get a stable placeholder address, like WhatsApp sign-ins. */
export const facebookEmail = (fbId: string, email?: string | null) => (email ? email.trim().toLowerCase() : `fb-${fbId}@facebook.valueaqar.invalid`);

/** The cookie value set at start and checked at the callback (blocks forged callbacks). */
export function readCookie(header: string | null, name: string) {
  for (const part of (header ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

export type FinishError = "cancelled" | "state" | "not_configured" | "facebook" | "banned" | "server";
