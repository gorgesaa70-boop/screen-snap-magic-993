import "./lib/error-capture";

import { consumeLastCapturedError, describeError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

/** Item 37: keep a copy of server crashes in app_errors (admin panel). Never throws. */
async function logServerError(error: unknown, request: Request) {
  // The visitor closed the page mid-load ("Error: aborted"): not a crash, so keep it out of the admin list.
  if (request.signal?.aborted || /^(Error: )?aborted$/i.test(String((error as Error)?.message ?? error))) return;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const text = describeError(error);
    await supabaseAdmin.rpc("log_app_error", {
      _kind: "server", _message: text.split("\n")[0]!.slice(0, 500), _stack: text.slice(0, 4000),
      _path: new URL(request.url).pathname, _ua: (request.headers.get("user-agent") ?? "").slice(0, 300),
    });
  } catch { /* logging must never break the error page */ }
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response, request: Request): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  const error = consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`);
  console.error(error);
  await logServerError(error, request);
  return new Response(renderErrorPage(), {
    status: 503,
    headers: { "content-type": "text/html; charset=utf-8", "X-Robots-Tag": "noindex", "Retry-After": "120", "Cache-Control": "no-store" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

/**
 * A render error inside the page (the root error screen, «الصفحة ما حمّلتش») used to go out as a normal 200 page,
 * and Google kept it as the page's content. Such pages now answer 503 «try again later» with noindex: search engines
 * keep the last good copy and come back. Only HTML pages are read; everything else streams as before.
 */
async function markFailedRender(response: Response): Promise<Response> {
  if (response.status !== 200 || !(response.headers.get("content-type") ?? "").includes("text/html")) return response;
  const body = await response.text();
  const headers = new Headers(response.headers);
  // <!--$!--> is React's mark for a part that failed on the server and is left to the browser (which may fail too).
  if (!body.includes('data-va-failed="1"') && !body.includes("<!--$!-->")) return new Response(body, { status: 200, statusText: response.statusText, headers });
  headers.set("X-Robots-Tag", "noindex");
  headers.set("Retry-After", "120");
  headers.set("Cache-Control", "no-store");
  return new Response(body, { status: 503, headers });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await markFailedRender(await normalizeCatastrophicSsrResponse(response, request));
    } catch (error) {
      console.error(error);
      await logServerError(error, request);
      return new Response(renderErrorPage(), {
        status: 503,
        headers: { "content-type": "text/html; charset=utf-8", "X-Robots-Tag": "noindex", "Retry-After": "120", "Cache-Control": "no-store" },
      });
    }
  },
};
