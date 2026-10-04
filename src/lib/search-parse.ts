/**
 * Pure validation for AI-parsed search queries. The model output is untrusted:
 * every value is checked against the platform's own allowed lists and only
 * filters that exist in the residential search (Filters) are returned.
 * No SQL or query text is ever produced from model output.
 */
import { TYPES, AREAS } from "@/components/site/data";
import type { Filters } from "@/components/site/search";

export const STATUSES = ["بيع", "إيجار"] as const;

/** Converts Arabic-Indic / Persian digits and separators to ASCII. */
export function normalizeDigits(s: string): string {
  return s
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[\u066B]/g, ".")
    .replace(/[\u066C\u060C]/g, ",");
}

/** Arabic letter normalization for tolerant matching (أ/إ/آ→ا، ة→ه، ى→ي). */
export function normalizeArabic(s: string): string {
  return normalizeDigits(s)
    .replace(/[\u064B-\u0652\u0640]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/\s+/g, " ")
    .trim();
}

const ORDINALS: Record<string, string> = { "1": "الاول", "2": "الثاني", "3": "الثالث", "4": "الرابع", "5": "الخامس" };

/** Returns the canonical value from `allowed` matching `v`, or "" if none. */
export function matchAllowed(v: unknown, allowed: readonly string[]): string {
  if (typeof v !== "string" || !v.trim()) return "";
  let n = normalizeArabic(v).replace(/^ال(?=حي)/, "");
  n = n.replace(/^حي\s*(\d)$/, (_, d) => `حي ${ORDINALS[d] ?? d}`);
  for (const a of allowed) {
    const na = normalizeArabic(a).replace(/^ال(?=حي)/, "");
    if (na === n) return a;
  }
  return "";
}

/** Parses a price like 1500000, "1.5 مليون", "750 الف" into a positive integer. */
export function parseAmount(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) && v > 0 ? Math.round(v) : null;
  if (typeof v !== "string") return null;
  const s = normalizeArabic(v).replace(/,/g, "");
  const m = s.match(/(\d+(?:\.\d+)?)/);
  if (!m) return null;
  let n = Number(m[1]);
  if (/مليون|million|m\b/i.test(s)) n *= 1_000_000;
  else if (/الف|الاف|k\b/i.test(s)) n *= 1_000;
  return n > 0 && n < 1e12 ? Math.round(n) : null;
}

export type ParsedSearch = {
  category: "residential" | "industrial" | "unknown";
  filters: Filters;
  /** Requested criteria the platform cannot filter on yet (e.g. size, rooms). */
  unsupported: string[];
  /** True when nothing usable was understood. */
  ambiguous: boolean;
};

/** Validates raw model JSON into safe, platform-supported filters. */
export function validateParsed(raw: unknown): ParsedSearch {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const category = r.category === "industrial" ? "industrial" : r.category === "residential" ? "residential" : "unknown";
  let min = parseAmount(r.min_price);
  let max = parseAmount(r.max_price);
  if (min !== null && max !== null && min > max) [min, max] = [max, min];
  const filters: Filters = {
    type: category === "industrial" ? "" : matchAllowed(r.type, TYPES),
    status: matchAllowed(r.status, STATUSES),
    area: category === "industrial" ? "" : matchAllowed(r.area, AREAS),
    min: min === null ? "" : String(min),
    max: max === null ? "" : String(max),
  };
  const unsupported: string[] = [];
  if (parseAmount(r.size) !== null) unsupported.push("المساحة");
  if (parseAmount(r.rooms) !== null) unsupported.push("عدد الغرف");
  const ambiguous = category !== "industrial" && Object.values(filters).every((v) => v === "");
  return { category, filters, unsupported, ambiguous };
}

/** Extracts the first JSON object from model text; null if absent/invalid. */
export function extractJson(text: string): unknown {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}
