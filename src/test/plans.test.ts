import { describe, it, expect } from "vitest";
import type { Property } from "@/components/site/data";
import { listingPlanLines, planTermPrice } from "@/components/site/data";
import { withPins } from "@/components/site/mix";

const p = (id: string, featured = false, isDemo = false) => ({ id, type: "شقة", featured, isDemo }) as Property;

describe("plans", () => {
  it("longer terms get the discount (same rule as the database)", () => {
    const d = { 1: 0, 3: 10, 6: 20, 12: 30 };
    expect(planTermPrice(599, 1, d)).toBe(599);
    expect(planTermPrice(999, 3, d)).toBe(2697);
    expect(planTermPrice(599, 12, d)).toBe(5032);
  });
  it("describes what a plan gives", () => {
    const lines = listingPlanLines({ max_properties: 6, listing_days: null, featured_slots: 1, pin_days: 7, features: [], verified_badge: true, whatsapp_broadcast: true, stats_level: "full", support_level: "priority" });
    expect(lines).toContain("6 إعلان ظاهرين في نفس الوقت");
    expect(lines).toContain("تثبيت إعلان على الواجهة 7 يوم");
    expect(lines.some((l) => l.includes("متحقق"))).toBe(true);
  });
  it("homepage pins: at most N on top, taking turns, the rest after", () => {
    const list = [p("a"), p("f1", true), p("f2", true), p("f3", true), p("b"), p("d", true, true)];
    const first = withPins(list, 2, () => 0);
    expect(first.slice(0, 2).every((x) => x.featured)).toBe(true);
    expect(first).toHaveLength(list.length);
    expect(new Set(first.map((x) => x.id)).size).toBe(list.length);
    const other = withPins(list, 2, () => 0.99);
    expect(other.slice(0, 2).map((x) => x.id)).not.toEqual(first.slice(0, 2).map((x) => x.id));
    expect(withPins(list, 2).slice(0, 2).some((x) => x.id === "d")).toBe(false);
  });
});
