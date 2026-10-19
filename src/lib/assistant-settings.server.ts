/**
 * «تعليمات المساعد» from the admin (release 37), read with the service role and kept for a minute per server instance.
 * Before release 37 (or on any error) everything falls back to the built-in behaviour.
 */
export type Floating = "assistant" | "whatsapp" | "both" | "none";
export type AssistantSettings = { instructions: string; welcome: string; floating: Floating };
const DEFAULTS: AssistantSettings = { instructions: "", welcome: "", floating: "assistant" };
const MODES: Floating[] = ["assistant", "whatsapp", "both", "none"];

let cache: { at: number; value: AssistantSettings } | null = null;

export async function getAssistantSettings(): Promise<AssistantSettings> {
  if (cache && Date.now() - cache.at < 60_000) return cache.value;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabaseAdmin as any).from("assistant_settings").select("instructions, welcome, floating").eq("id", 1).maybeSingle();
    const value: AssistantSettings = error || !data ? DEFAULTS : {
      instructions: String(data.instructions ?? "").trim(), welcome: String(data.welcome ?? "").trim(),
      floating: MODES.includes(data.floating) ? data.floating : "assistant",
    };
    cache = { at: Date.now(), value };
    return value;
  } catch {
    return DEFAULTS;
  }
}
