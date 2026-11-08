import { supabase } from "@/integrations/supabase/client";
import { getDeviceId } from "@/lib/track";

/** Anonymous numbers for «أداء التطبيق»: a random device id and what was searched. Failures never touch the page. */
const OPENED = "va_opened_day";

export async function trackAppOpen() {
  if (typeof window === "undefined") return;
  const today = new Date().toISOString().slice(0, 10);
  try { if (localStorage.getItem(OPENED) === today) return; localStorage.setItem(OPENED, today); } catch { /* still count it */ }
  let platform = "web";
  try { const { Capacitor } = await import("@capacitor/core"); platform = Capacitor.getPlatform(); } catch { /* website */ }
  void supabase.rpc("track_app_open", { _device: getDeviceId(), _platform: platform }).then(() => {}, () => {});
}

/** Only the words the visitor chose in the search form. */
export function trackAppSearch(parts: (string | null | undefined)[], results: number) {
  if (typeof window === "undefined") return;
  const label = parts.filter(Boolean).join(" · ");
  if (!label) return;
  void supabase.rpc("track_app_search", { _device: getDeviceId(), _label: label, _results: results }).then(() => {}, () => {});
}
