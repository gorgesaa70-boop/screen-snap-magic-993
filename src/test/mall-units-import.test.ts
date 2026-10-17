import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { MALL_UNIT_HEADERS, parseMallUnitsSheet } from "@/lib/mall-units-import";

const MALLS = [{ id: "m1", name: "جميرا" }, { id: "m2", name: "أسواق المدينة" }];
const sheet = (...rows: unknown[][]) => parseMallUnitsSheet([MALL_UNIT_HEADERS, ...rows], MALLS);

describe("mall units import", () => {
  it("reads units, matching mall names, short type names and floor words or numbers", () => {
    const r = sheet(
      ["جميرا", "محل 12", "محل", "الأرضي", "بيع", "٣٠", "١٬٢٠٠٬٠٠٠ ج.م", ""],
      ["اسواق المدينه", "", "عيادة", "2", "إيجار", 45, 9000, "واجهة"],
      ["جميرا", "", "شقة", "الدور الرابع", "للبيع", 120, 2500000, ""],
    );
    expect(r.errors).toEqual([]);
    expect(r.units.map((u) => [u.mall_id, u.type, u.floor, u.status, u.size, u.price])).toEqual([
      ["m1", "محل تجاري", "الأرضي", "بيع", 30, 1200000],
      ["m2", "عيادة", "التاني", "إيجار", 45, 9000],
      ["m1", "شقة سكنية", "الرابع", "بيع", 120, 2500000],
    ]);
    expect(r.units[1]!.title).toBe("عيادة — الدور التاني — أسواق المدينة");
  });
  it("reports every problem with the row number and skips empty rows", () => {
    const r = sheet(["مول مش موجود", "", "بنك", "ميزانين", "تمليك", 0, "", ""], ["", "", "", "", "", "", "", ""]);
    expect(r.units).toHaveLength(0);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]!.row).toBe(2);
    for (const word of ["المول", "نوع الوحدة", "الدور", "الغرض", "المساحة", "السعر"]) expect(r.errors[0]!.message).toContain(word);
  });
  it("reads a developer price list: price = size × price per m², installments from the payment text, defaults", () => {
    const dev = parseMallUnitsSheet([
      ["اسم المشروع ", "المدينة", "المنطقة", "العنوان", "المساحات ", "سعر المتر ", "انظمه السداد", "الاستلام"],
      [],
      ["سنترال بوينت ", "برج العرب الجديدة", "الحي الأول", "امام كومباوند المهندسين ", "            33م             ", 145000, " قسط علي 3 سنين      15% مقدم ", "خلال سنتين "],
      ["سنترال بوينت ", "برج العرب الجديدة", "الحي الأول", "امام كومباوند المهندسين ", "            35م           85,000", 85000, " قسط علي 3 سنين      20% مقدم ", "خلال سنتين "],
      ["سنترال بوينت ", "برج العرب الجديدة", "الحي الأول", "امام كومباوند المهندسين ", "            19م            73,000", "", " قسط علي 3 سنين      20% مقدم ", "خلال سنتين "],
    ], [{ id: "c", name: "سنترال بوينت" }], { type: "محل تجاري", floor: "الأرضي", status: "بيع" });
    expect(dev.errors).toEqual([]);
    expect(dev.units.map((u) => [u.size, u.price, u.down_payment, u.installment_years, u.type, u.floor, u.status])).toEqual([
      [33, 4785000, 717750, 3, "محل تجاري", "الأرضي", "بيع"],
      [35, 2975000, 595000, 3, "محل تجاري", "الأرضي", "بيع"],
      [19, 1387000, 277400, 3, "محل تجاري", "الأرضي", "بيع"],
    ]);
    expect(dev.units[0]!.monthly_installment).toBe(Math.round((4785000 - 717750) / 36));
    expect(dev.units[0]!.title).toBe("محل تجاري 33 م² — الدور الأرضي — سنترال بوينت");
    expect(dev.units[0]!.description).toContain("امام كومباوند المهندسين");
    expect(dev.units[0]!.description).toContain("الاستلام: خلال سنتين");
    expect(dev.units[0]!.note).toBeUndefined();
    expect(dev.units[2]!.note).toContain("73,000");
  });
  it("names missing required columns", () => {
    const r = parseMallUnitsSheet([["المول", "السعر"], ["جميرا", 1]], MALLS);
    expect(r.errors[0]!.message).toContain("الدور");
  });
});
