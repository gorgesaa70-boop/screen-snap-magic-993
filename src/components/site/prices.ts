import { supabase } from "@/integrations/supabase/client";

/** One price_index() row: median price per m² of a segment, for the last 12 months (month = null) or one month. */
export type IndexRow = {
  kind: "mall" | "residential";
  mall_id: string | null;
  city: string | null;
  area: string | null;
  floor_level: number | null;
  unit_type: string | null;
  finishing: string | null;
  purpose: "sale" | "rent";
  month: string | null;
  price_per_m2: number;
  samples: number;
};

/** Mall floors by level (5 = fifth or higher) and what they are usually used for in Borg El Arab. */
export const FLOOR_LABEL = ["الأرضي", "الأول", "التاني", "التالت", "الرابع", "الخامس أو أعلى"];
export const FLOOR_USE = ["تجاري", "تجاري", "إداري / طبي", "إداري / طبي", "سكني", "سكني"];
export const FINISHING_KEYS = ["skeleton", "semi", "full", "super_lux"] as const;
export const DEFAULT_RATIOS: Record<string, number> = { skeleton: 0.55, semi: 0.75, full: 1, super_lux: 1.2 };

/** Never throws: an empty list means "no prices yet". */
export async function fetchPriceIndex(): Promise<IndexRow[]> {
  const { data, error } = await supabase.rpc("price_index");
  // No prices is a normal state (not enough units, or the database not updated yet): show "collecting" instead of an error.
  if (error) return [];
  return (data ?? []).map((r) => ({ ...r, price_per_m2: Number(r.price_per_m2), samples: Number(r.samples) })) as IndexRow[];
}

export async function fetchFinishingRatios(): Promise<Record<string, number>> {
  const { data } = await supabase.from("app_settings").select("finishing_ratios").eq("id", 1).maybeSingle();
  const r = (data?.finishing_ratios ?? {}) as Record<string, unknown>;
  return Object.fromEntries(Object.entries(DEFAULT_RATIOS).map(([k, v]) => [k, Number(r[k]) > 0 ? Number(r[k]) : v]));
}

type Key = { [K in "kind" | "mall_id" | "city" | "area" | "floor_level" | "unit_type" | "finishing" | "purpose"]?: IndexRow[K] | undefined };
const same = (a: unknown, b: unknown) => (a ?? null) === (b ?? null);
/** Rows of exactly this segment (fields left out of the key must be null on the row, except city). */
const matches = (r: IndexRow, k: Key) =>
  same(r.kind, k.kind) && same(r.purpose, k.purpose) && same(r.mall_id, k.mall_id) && same(r.floor_level, k.floor_level) &&
  same(r.unit_type, k.unit_type) && same(r.finishing, k.finishing) && (k.area === undefined || same(r.area, k.area));

/** The 12-month figure for a segment, or null when there aren't enough units yet. */
export const current = (rows: IndexRow[], k: Key) => rows.find((r) => r.month === null && matches(r, k)) ?? null;

/** Monthly medians, oldest first. */
export const series = (rows: IndexRow[], k: Key) =>
  rows.filter((r) => r.month !== null && matches(r, k)).sort((a, b) => a.month!.localeCompare(b.month!));

/** % change between the latest month and the month about 3 months before it (null if not enough months). */
export function change3m(s: IndexRow[]) {
  if (s.length < 2) return null;
  const last = s[s.length - 1]!;
  const cutoff = new Date(last.month!);
  cutoff.setMonth(cutoff.getMonth() - 3);
  const base = [...s].reverse().find((r) => new Date(r.month!) <= cutoff) ?? s[0]!;
  if (base === last || !base.price_per_m2) return null;
  return Math.round(((last.price_per_m2 - base.price_per_m2) / base.price_per_m2) * 100);
}

/** Yearly rent ÷ sale price, in %. */
export const yieldPct = (salePpm?: number | null, rentPpm?: number | null) =>
  salePpm && rentPpm ? Math.round(((rentPpm * 12) / salePpm) * 1000) / 10 : null;

export const hasData = (rows: IndexRow[]) => rows.some((r) => r.month === null);
export const mallIdsWithData = (rows: IndexRow[]) => [...new Set(rows.filter((r) => r.kind === "mall" && r.month === null).map((r) => r.mall_id!))];
export const areasWithData = (rows: IndexRow[]) =>
  [...new Set(rows.filter((r) => r.kind === "residential" && r.month === null).map((r) => r.area!))];

export type Estimate = { ppm: number; low: number; high: number; approx: boolean; samples: number };

/**
 * Value of a unit from the index. Malls: the exact unit type on that floor, else all types on that floor.
 * Homes: the exact finishing, else another finishing level in the same district scaled by the finishing ratios.
 */
export function estimate(rows: IndexRow[], ratios: Record<string, number>, q: {
  kind: "mall" | "residential"; purpose: "sale" | "rent"; size: number;
  mall_id?: string; floor_level?: number; unit_type?: string; area?: string; finishing?: string;
}): Estimate | null {
  if (!(q.size > 0)) return null;
  let hit: IndexRow | null = null;
  let approx = false;
  let ppm = 0;
  if (q.kind === "mall") {
    const base = { kind: "mall" as const, purpose: q.purpose, mall_id: q.mall_id, floor_level: q.floor_level };
    hit = current(rows, { ...base, unit_type: q.unit_type });
    if (!hit) { hit = current(rows, base); approx = !!hit; }
    ppm = hit?.price_per_m2 ?? 0;
  } else {
    const k = { kind: "residential" as const, purpose: q.purpose, area: q.area, unit_type: q.unit_type };
    hit = current(rows, { ...k, finishing: q.finishing });
    if (hit) ppm = hit.price_per_m2;
    else if (q.finishing) {
      for (const other of ["full", "semi", "super_lux", "skeleton"]) {
        const r = current(rows, { ...k, finishing: other });
        if (r && ratios[other] && ratios[q.finishing]) { hit = r; approx = true; ppm = (r.price_per_m2 * ratios[q.finishing]!) / ratios[other]!; break; }
      }
    }
  }
  if (!hit || !ppm) return null;
  const value = ppm * q.size;
  const spread = approx ? 0.2 : 0.1;
  return { ppm: Math.round(ppm), low: Math.round(value * (1 - spread)), high: Math.round(value * (1 + spread)), approx, samples: hit.samples };
}
