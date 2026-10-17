import { describe, it, expect, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { applyMapping, cleanNumber, findHeaderRow, guessMapping, missingFields, sizeCell, type MapField } from "@/lib/sheet-mapping";
import { mallUnitFields, parseMallUnitsSheet } from "@/lib/mall-units-import";
import { parseUnitsSheet, unitFields } from "@/lib/units-import";

// The developer price list as it arrived (سنترال بوينت): a title row above, blank rows, odd spacing.
const centralPoint: unknown[][] = [
  ["قائمة أسعار سنترال بوينت"],
  [],
  ["اسم المشروع ", "المدينة", "المنطقة", "العنوان", "المساحات ", "سعر المتر ", "انظمه السداد", "الاستلام"],
  [],
  ["سنترال بوينت ", "برج العرب الجديدة", "الحي الأول", "امام كومباوند المهندسين ", "            33م             ", 145000, " قسط علي 3 سنين      15% مقدم ", "خلال سنتين "],
  ["سنترال بوينت ", "برج العرب الجديدة", "الحي الأول", "امام كومباوند المهندسين ", "            19م            73,000", "", " قسط علي 3 سنين      20% مقدم ", "خلال سنتين "],
];

describe("sheet mapping", () => {
  it("finds the header row below a title and blank rows", () => expect(findHeaderRow(centralPoint)).toBe(2));

  it("guesses columns from loosely matching titles (spelling, spaces, ال)", () => {
    const fields = mallUnitFields(["سنترال بوينت"]);
    const m = guessMapping(centralPoint[2]!, fields);
    expect(m["المول"]).toEqual({ col: 0 });
    expect(m["المساحة"]).toEqual({ col: 4 });
    expect(m["سعر المتر"]).toEqual({ col: 5 });
    expect(m["انظمه السداد"]).toEqual({ col: 6 });
    expect(m["الاستلام"]).toEqual({ col: 7 });
    expect(m["العنوان"]).toEqual({ col: 3 });
    expect(m["المنطقة"]).toEqual({ col: 2 });
    expect(m["نوع الوحدة"]).toBeNull();
    expect(missingFields(m, fields)).toEqual(["نوع الوحدة", "الدور", "الغرض (بيع / إيجار)"]);
  });

  it("turns any layout + fixed values into rows the mall parser reads, with real sheet row numbers", () => {
    const fields = mallUnitFields(["سنترال بوينت"]);
    const m = { ...guessMapping(centralPoint[2]!, fields), "نوع الوحدة": { value: "محل تجاري" }, "الدور": { value: "الأرضي" }, "الغرض": { value: "بيع" } };
    expect(missingFields(m, fields)).toEqual([]);
    const rows = applyMapping(centralPoint, 2, m, fields, [1], "الوصف");
    const r = parseMallUnitsSheet(rows, [{ id: "c", name: "سنترال بوينت" }]);
    expect(r.errors).toEqual([]);
    expect(r.units.map((u) => [u.row, u.size, u.price, u.type, u.floor, u.status])).toEqual([
      [3, 33, 4785000, "محل تجاري", "الأرضي", "بيع"],
      [4, 19, 1387000, "محل تجاري", "الأرضي", "بيع"],
    ]);
    // +2 header offset → sheet rows 5 and 6 (shifted by the screen).
    expect(r.units[0]!.description).toContain("المدينة: برج العرب الجديدة");
    expect(r.units[1]!.note).toContain("73,000");
  });

  it("a fixed mall replaces a missing or differently written mall column", () => {
    const fields = mallUnitFields(["سنترال بوينت"]);
    const sheet = [["المساحة", "السعر"], ["40 م", "2,000,000 ج.م"]];
    const m = { ...guessMapping(sheet[0]!, fields), "المول": { value: "سنترال بوينت" }, "نوع الوحدة": { value: "عيادة" }, "الدور": { value: "الأول" }, "الغرض": { value: "إيجار" } };
    const r = parseMallUnitsSheet(applyMapping(sheet, 0, m, fields), [{ id: "c", name: "سنترال بوينت" }]);
    expect(r.errors).toEqual([]);
    expect(r.units[0]).toMatchObject({ mall_id: "c", size: 40, price: 2000000, type: "عيادة", status: "إيجار" });
  });

  it("compound/project units: price per m² and a fixed type", () => {
    const fields = unitFields();
    const sheet = [["رقم", "المساحات", "سعر المتر"], ["A1", "120م", "25,000"]];
    const m = { ...guessMapping(sheet[0]!, fields), "النوع": { value: "شقة" } };
    const r = parseUnitsSheet(applyMapping(sheet, 0, m, fields));
    expect(r.errors).toEqual([]);
    expect(r.units[0]).toMatchObject({ unit_type: "شقة", size: 120, price: 3000000 });
  });

  it("requires one of a group (total price or price per m²)", () => {
    const fields: MapField[] = [{ key: "a", label: "أ", group: "g" }, { key: "b", label: "ب", group: "g" }];
    expect(missingFields({ a: null, b: null }, fields)).toEqual(["أ أو ب"]);
    expect(missingFields({ a: { col: 0 }, b: null }, fields)).toEqual([]);
  });

  it("reads numbers the way price lists write them", () => {
    expect(cleanNumber("١٬٢٥٠٬٠٠٠ ج.م")).toBe(1250000);
    expect(cleanNumber("33م")).toBe(33);
    expect(cleanNumber("")).toBeNull();
    expect(cleanNumber("على الطلب")).toBe("bad");
    expect(sizeCell("35م 85,000")).toEqual({ size: 35, extra: 85000 });
  });
});
