import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import type { ListingCard } from "./whatsapp-bot";

/**
 * The site's floating assistant: same brain as the WhatsApp bot (real listings only, no brokers' numbers), answered on
 * the server so the AI key never reaches the browser. Public, so it is rate-limited per visitor address.
 */

const WINDOW_MS = 10 * 60_000, MAX_PER_WINDOW = 30;
const hits = new Map<string, { at: number; n: number }>();
function allowed(ip: string) {
  const now = Date.now(), h = hits.get(ip);
  if (!h || now - h.at > WINDOW_MS) { hits.set(ip, { at: now, n: 1 }); return true; }
  h.n++;
  return h.n <= MAX_PER_WINDOW;
}

const input = z.object({
  messages: z.array(z.object({ role: z.enum(["user", "model"]), text: z.string().max(1500) })).min(1).max(16),
});

export type AssistantReply = { ok: true; text: string; listings: ListingCard[]; handoff: boolean; request: Record<string, string | number>; ai: boolean } | { ok: false; error: string };

export const askAssistant = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => input.parse(d))
  .handler(async ({ data }): Promise<AssistantReply> => {
    const ip = getRequestHeader("cf-connecting-ip") || getRequestHeader("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (!allowed(ip)) return { ok: false, error: "rate" };
    // The visitor's own (anonymous) view of the data: only approved, public listings.
    const { supabase: db } = await import("@/integrations/supabase/client");
    const last = [...data.messages].reverse().find((m) => m.role === "user")?.text ?? "";

    // A listing code or link → its card, AI or not.
    const { listingNumbers, listingIds } = await import("./whatsapp-bot");
    const numbers = listingNumbers(last), ids = listingIds(last);
    if (numbers.length || ids.length) {
      const { findListings } = await import("./whatsapp-bot.server");
      const found = await findListings(db, numbers, ids);
      return { ok: true, ai: false, handoff: false, request: {}, listings: found, text: found.length ? "ده العقار اللي بتسأل عليه 👇" : "مالقيتش إعلان بالكود ده، ممكن يكون اتباع أو اتشال. قولّي بتدوّر على إيه وأنا أساعدك." };
    }

    const { aiReply } = await import("./whatsapp-ai.server");
    const ai = await aiReply(db, data.messages, "web").catch((e: Error) => { console.error("assistant ai error", e.message); return null; });
    if (!ai) return { ok: true, ai: false, handoff: false, request: {}, listings: [], text: "" };
    return { ok: true, ai: true, text: ai.text, listings: ai.listings, handoff: ai.handoff, request: ai.request };
  });
