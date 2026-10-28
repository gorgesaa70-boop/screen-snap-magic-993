import { createFileRoute } from "@tanstack/react-router";
import { FB_CALLBACK_PATH, FB_FINISH_PATH, FB_STATE_COOKIE, facebookDialogUrl, publicOrigin } from "@/lib/facebook-auth";

/** «المتابعة بحساب Facebook» → Facebook's consent page (with a one-time state kept in a short-lived cookie). */
export const Route = createFileRoute("/api/public/auth/facebook/start")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const origin = publicOrigin(request);
        const appId = process.env["FACEBOOK_APP_ID"];
        if (!appId || !process.env["FACEBOOK_APP_SECRET"]) return Response.redirect(`${origin}${FB_FINISH_PATH}#error=not_configured`, 302);
        const state = Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, "0")).join("");
        return new Response(null, {
          status: 302,
          headers: {
            Location: facebookDialogUrl(appId, `${origin}${FB_CALLBACK_PATH}`, state),
            "Set-Cookie": `${FB_STATE_COOKIE}=${state}; Path=/api/public/auth/facebook; Max-Age=600; HttpOnly; Secure; SameSite=Lax`,
            "Cache-Control": "no-store",
          },
        });
      },
    },
  },
});
