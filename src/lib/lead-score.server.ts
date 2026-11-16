import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/** Scores new leads against app_settings.ideal_customer with Lovable AI (score, short Arabic summary, worth-a-call flag). */
type Db = SupabaseClient<Database>;
export type LeadScore = { score: number; summary: string; worth_call: boolean };

export function parseLeadScore(raw: string): LeadScore | null {
  try {
    const j = JSON.parse(raw.trim().replace(/^```(?:json)?|```$/g, ""));
    const score = Math.max(0, Math.min(100, Math.round(Number(j.score))));
    if (!Number.isFinite(score) || typeof j.summary !== "string") return null;
    return { score, summary: j.summary.slice(0, 400), worth_call: Boolean(j.worth_call) };
  } catch {
    return null;
  }
}

async function scoreOne(key: string, ideal: string, lead: Record<string, unknown>): Promise<LeadScore | "stop" | null> {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "X-Lovable-AIG-SDK": "fetch" },
    body: JSON.stringify({
      model: "google/gemini-3.8-flash",
      messages: [
        { role: "system", content: `قيّم طلب عميل عقاري مقابل وصف العميل المثالي. رد JSON فقط: {"score":0-100,"summary":"ملخص عربي قصير جملة أو اتنين","worth_call":true|false}. worth_call = true لو الطلب جاد ويستاهل مكالمة سريعة.\nالعميل المثالي: ${ideal}` },
        { role: "user", content: JSON.stringify(lead) },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (res.status === 402 || res.status === 403 || res.status === 429) return "stop";
  if (!res.ok) return null;
  const j = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return parseLeadScore(j.choices?.[0]?.message?.content ?? "");
}

export async function runLeadScoring(db: Db, limit = 10) {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) return 0;
  const { data: s } = await db.from("app_settings").select("ideal_customer").limit(1).maybeSingle();
  const ideal = s?.ideal_customer ?? "";
  const { data: leads } = await db
    .from("leads")
    .select("id, kind, purpose, property_type, area, budget, size_m2, details, source, phone_verified, ai_score_attempts, created_at")
    .is("ai_scored_at", null)
    .lt("ai_score_attempts", 3)
    .gte("created_at", new Date(Date.now() - 7 * 864e5).toISOString())
    .order("created_at")
    .limit(limit);
  let done = 0;
  for (const l of leads ?? []) {
    const { id, ai_score_attempts, ...facts } = l;
    const r = await scoreOne(key, ideal, facts);
    if (r === "stop") break; // out of credits / rate limited: try next run
    if (!r) {
      await db.from("leads").update({ ai_score_attempts: ai_score_attempts + 1 }).eq("id", id);
      continue;
    }
    await db.from("leads").update({ ai_score: r.score, ai_summary: r.summary, ai_worth_call: r.worth_call, ai_scored_at: new Date().toISOString() }).eq("id", id);
    done++;
  }
  return done;
}
