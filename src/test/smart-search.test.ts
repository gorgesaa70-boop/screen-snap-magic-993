import { describe, it, expect } from "vitest";
import { resolveSmart, suggestRelaxed } from "@/components/site/smart-search";
import { emptyFilters } from "@/components/site/search";
import type { Property } from "@/components/site/data";

const p = (o: Partial<Property>): Property => ({
  id: Math.random().toString(), title: "", description: null, image: "", price: 1_000_000, type: "شقة", city: "برج العرب الجديدة", area: "الحي الأول",
  size: 100, status: "بيع", updated: "", isDemo: false, featured: false, brokerId: null, ...o,
});
const list = [p({}), p({ type: "محل", area: "الحي الثاني", price: 3_000_000 })];
const base = { unsupported: [], ambiguous: false };

describe("smart-search", () => {
  it("applies validated filters", () => {
    const r = resolveSmart({ ...base, category: "residential", filters: { ...emptyFilters, type: "شقة", max: "1500000" } }, list);
    expect(r).toMatchObject({ kind: "apply", count: 1, suggestion: null });
  });
  it("routes industrial requests", () => {
    expect(resolveSmart({ ...base, category: "industrial", filters: emptyFilters }, list).kind).toBe("industrial");
  });
  it("reports ambiguous requests", () => {
    expect(resolveSmart({ ...base, ambiguous: true, category: "unknown", filters: emptyFilters }, list).kind).toBe("ambiguous");
  });
  it("suggests a wider search when nothing matches", () => {
    const f = { ...emptyFilters, type: "محل", max: "1000000" };
    expect(suggestRelaxed(list, f)).toEqual({ ...f, max: "" });
    const r = resolveSmart({ ...base, category: "residential", filters: f }, list);
    expect(r).toMatchObject({ kind: "apply", count: 0 });
  });
  it("returns null when even wide search is empty", () => {
    expect(suggestRelaxed(list, { ...emptyFilters, type: "فيلا" })).toBeNull();
  });
});
