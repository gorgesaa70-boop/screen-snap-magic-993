/**
 * Item 37: send browser errors to log_app_error() (grouped per day, admin-only). At most 5 reports per page load,
 * and noise from browser extensions / cross-origin scripts is ignored.
 */
import { supabase } from "@/integrations/supabase/client";

let sent = 0;
const NOISE = /ResizeObserver loop|^Script error\.?$|Load failed|Failed to fetch dynamically imported module|chrome-extension:|moz-extension:|safari-extension:/i;

export function reportAppError(error: unknown) {
  if (typeof window === "undefined" || sent >= 5) return;
  const message = error instanceof Response ? `Response ${error.status} ${error.url}` : error instanceof Error ? `${error.name}: ${error.message}` : String(error ?? "");
  const stack = error instanceof Error ? (error.stack ?? null) : null;
  if (!message || NOISE.test(message) || (stack && NOISE.test(stack))) return;
  sent++;
  void supabase.rpc("log_app_error", {
    _kind: "client", _message: message.slice(0, 500), _stack: stack ? stack.slice(0, 4000) : "",
    _path: window.location.pathname, _ua: navigator.userAgent.slice(0, 300),
  }).then(() => undefined, () => undefined);
}

/** Call once on app start. */
export function initErrorReporting() {
  if (typeof window === "undefined" || import.meta.env.DEV) return;
  window.addEventListener("error", (e) => reportAppError(e.error ?? e.message));
  window.addEventListener("unhandledrejection", (e) => reportAppError(e.reason));
}
