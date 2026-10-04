import { describe, it, expect } from "vitest";
import { normalizeDigits, matchAllowed, parseAmount, validateParsed, extractJson } from "@/lib/search-parse";
import { AREAS, TYPES } from "@/components/site/data";

describe("search-parse", () => {
  it("converts Arabic digits", () => {
    expect(normalizeDigits("١٥٠٠٠٠٠ و ۲")).toBe("1500000 و 2");
  });
  it("matches area spelling variants", () => {
    expect(matchAllowed("الحى الاول", AREAS)).toBe("الحي الأول");
    expect(matchAllowed("حي 2", AREAS)).toBe("الحي الثاني");
    expect(matchAllowed("برج العرب", AREAS)).toBe("");
    expect(matchAllowed("شقه", TYPES)).toBe("شقة");
  });
  it("parses amounts", () => {
    expect(parseAmount("1.5 مليون")).toBe(1500000);
    expect(parseAmount("٧٥٠ ألف")).toBe(750000);
    expect(parseAmount(-5)).toBeNull();
    expect(parseAmount("كتير")).toBeNull();
  });
  it("apartment in first district under 1.5M", () => {
    const r = validateParsed({ category: "residential", type: "شقة", area: "الحي الأول", max_price: 1500000 });
    expect(r.filters).toEqual({ type: "شقة", status: "", area: "الحي الأول", min: "", max: "1500000" });
    expect(r.ambiguous).toBe(false);
  });
  it("shop for sale in Borg El Arab keeps area empty", () => {
    const r = validateParsed({ category: "residential", type: "محل", status: "بيع", area: "برج العرب" });
    expect(r.filters.area).toBe("");
    expect(r.filters.type).toBe("محل");
  });
  it("industrial land with size is flagged, size not invented as filter", () => {
    const r = validateParsed({ category: "industrial", type: "أرض", size: 1000 });
    expect(r.category).toBe("industrial");
    expect(r.filters.type).toBe("");
    expect(r.unsupported).toContain("المساحة");
  });
  it("rejects invented values and garbage", () => {
    const r = validateParsed({ type: "قصر", status: "تمليك", area: "DROP TABLE", min_price: "x" });
    expect(r.ambiguous).toBe(true);
    expect(validateParsed(null).ambiguous).toBe(true);
  });
  it("swaps reversed price range", () => {
    const r = validateParsed({ min_price: 2000000, max_price: 1000000 });
    expect([r.filters.min, r.filters.max]).toEqual(["1000000", "2000000"]);
  });
  it("extracts JSON safely", () => {
    expect(extractJson('نتيجة: {"type":"شقة"}')).toEqual({ type: "شقة" });
    expect(extractJson("no json")).toBeNull();
    expect(extractJson("{bad")).toBeNull();
  });
});
