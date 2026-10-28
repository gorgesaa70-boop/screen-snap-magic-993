import { createFileRoute } from "@tanstack/react-router";
import { FB_CALLBACK_PATH, FB_FINISH_PATH, FB_GRAPH, FB_STATE_COOKIE, facebookEmail, publicOrigin, readCookie, type FinishError } from "@/lib/facebook-auth";

type FbProfile = { id?: string; name?: string; email?: string; picture?: { data?: { url?: string } } };

async function appSecretProof(token: string, secret: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(token));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Facebook sends the person back here: check the state, swap the code for their profile, sign them in to the
 * account with their e-mail (or create one), and hand a one-time sign-in token to the finish page.
 */
export const Route = createFileRoute("/api/public/auth/facebook/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const origin = publicOrigin(request);
        const clearCookie = `${FB_STATE_COOKIE}=; Path=/api/public/auth/facebook; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
        const finish = (fragment: string) => new Response(null, {
          status: 302, headers: { Location: `${origin}${FB_FINISH_PATH}#${fragment}`, "Set-Cookie": clearCookie, "Cache-Control": "no-store" },
        });
        const fail = (e: FinishError) => finish(`error=${e}`);

        if (url.searchParams.get("error")) return fail("cancelled");
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const expected = readCookie(request.headers.get("cookie"), FB_STATE_COOKIE);
        if (!code || !state || !expected || state !== expected) return fail("state");
        const appId = process.env["FACEBOOK_APP_ID"];
        const secret = process.env["FACEBOOK_APP_SECRET"];
        if (!appId || !secret) return fail("not_configured");

        // 1) Code → access token → profile.
        const tokenRes = await fetch(`${FB_GRAPH}/oauth/access_token?${new URLSearchParams({ client_id: appId, client_secret: secret, redirect_uri: `${origin}${FB_CALLBACK_PATH}`, code })}`).catch(() => null);
        const tokenJson = (await tokenRes?.json().catch(() => null)) as { access_token?: string; error?: { message?: string } } | null;
        if (!tokenJson?.access_token) { console.error("fb token failed", tokenRes?.status, tokenJson?.error?.message?.slice(0, 200)); return fail("facebook"); }
        const token = tokenJson.access_token;
        const meRes = await fetch(`${FB_GRAPH}/me?${new URLSearchParams({ fields: "id,name,email,picture.width(256)", access_token: token, appsecret_proof: await appSecretProof(token, secret) })}`).catch(() => null);
        const me = (await meRes?.json().catch(() => null)) as FbProfile | null;
        if (!me?.id) { console.error("fb profile failed", meRes?.status); return fail("facebook"); }

        // 2) Their account: the same e-mail signs in to the same account; otherwise a new one.
        const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
        const email = facebookEmail(me.id, me.email);
        const meta = { full_name: me.name ?? null, name: me.name ?? null, avatar_url: me.picture?.data?.url ?? null, facebook_id: me.id };
        const created = await db.auth.admin.createUser({ email, email_confirm: true, user_metadata: meta });
        if (created.error && !/already|registered|exists/i.test(created.error.message)) { console.error("fb createUser", created.error.message); return fail("server"); }
        const { data: link, error: linkErr } = await db.auth.admin.generateLink({ type: "magiclink", email });
        if (linkErr || !link.properties?.hashed_token || !link.user) { console.error("fb generateLink", linkErr?.message); return fail("server"); }
        if (link.user.banned_until && new Date(link.user.banned_until).getTime() > Date.now()) return fail("banned");
        return finish(`th=${encodeURIComponent(link.properties.hashed_token)}`);
      },
    },
  },
});
