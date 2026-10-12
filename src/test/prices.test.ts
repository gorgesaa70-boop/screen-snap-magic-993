import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { change3m, current, DEFAULT_RATIOS, estimate, yieldPct, type IndexRow } from "@/components/site/prices";

const row = (r: Partial<IndexRow>): IndexRow => ({
  kind: "mall", mall_id: null, city: null, area: null, floor_level: null, unit_type: null, finishing: null,
  purpose: "sale", month: null, price_per_m2: 0, samples: 3, ...r,
});
const M = "m1";
const rows = [
  row({ mall_id: M, floor_level: 0, unit_type: "محل تجاري", price_per_m2: 40000 }),
  row({ mall_id: M, floor_level: 0, price_per_m2: 35000 }),
  row({ mall_id: M, floor_level: 0, purpose: "rent", price_per_m2: 350 }),
  row({ kind: "residential", city: "برج العرب الجديدة", area: "الحي الأول", unit_type: "شقة", finishing: "full", price_per_m2: 10000 }),
];

describe("price index helpers", () => {
  it("finds the exact segment and nothing else", () => {
    expect(current(rows, { kind: "mall", purpose: "sale", mall_id: M, floor_level: 0, unit_type: "محل تجاري" })?.price_per_m2).toBe(40000);
    expect(current(rows, { kind: "mall", purpose: "sale", mall_id: M, floor_level: 0 })?.price_per_m2).toBe(35000);
    expect(current(rows, { kind: "mall", purpose: "sale", mall_id: M, floor_level: 1 })).toBeNull();
  });
  it("mall estimate: exact type, else every type on that floor (marked approximate)", () => {
    expect(estimate(rows, DEFAULT_RATIOS, { kind: "mall", purpose: "sale", size: 20, mall_id: M, floor_level: 0, unit_type: "محل تجاري" }))
      .toMatchObject({ ppm: 40000, low: 720000, high: 880000, approx: false });
    expect(estimate(rows, DEFAULT_RATIOS, { kind: "mall", purpose: "sale", size: 20, mall_id: M, floor_level: 0, unit_type: "عيادة" }))
      .toMatchObject({ ppm: 35000, approx: true });
    expect(estimate(rows, DEFAULT_RATIOS, { kind: "mall", purpose: "sale", size: 20, mall_id: M, floor_level: 3 })).toBeNull();
  });
  it("home estimate scales another finishing level by the ratios", () => {
    expect(estimate(rows, DEFAULT_RATIOS, { kind: "residential", purpose: "sale", size: 100, area: "الحي الأول", unit_type: "شقة", finishing: "semi" }))
      .toMatchObject({ ppm: 7500, approx: true });
  });
  it("yield and 3-month change", () => {
    expect(yieldPct(35000, 350)).toBe(12);
    const s = ["2026-05-01", "2026-06-01", "2026-07-01", "2026-08-01"].map((m, i) => row({ month: m, price_per_m2: 100 + i * 10 }));
    expect(change3m(s)).toBe(30);
    expect(change3m(s.slice(0, 1))).toBeNull();
  });
});
