import { describe, it, expect } from "vitest";
import { LISTING_HEADERS, parseListingsSheet } from "@/lib/properties-import";

const sheet = (...rows: unknown[][]) => parseListingsSheet([LISTING_HEADERS, ...rows]);

describe("listings import (item 32)", () => {
  it("accepts a valid sale listing and normalises spelling and digits", () => {
    const r = sheet(["", "شقه", "للبيع", "برج العرب الجديده", "الحي الاول", "١٬٥٠٠٬٠٠٠", "120", 3, 2, "تشطيب سوبر لوكس"]);
    expect(r.errors).toEqual([]);
    expect(r.listings[0]).toMatchObject({ row: 2, type: "شقة", status: "بيع", city: "برج العرب الجديدة", area: "الحي الأول", price: 1500000, size: 120, rooms: 3, title: "شقة للبيع في الحي الأول" });
  });
  it("cities without districts use the city as the area", () => {
    const r = sheet(["شقة قريبة من الطريق", "شقة", "بيع", "كينج مريوط", "", "3000", "", "", "", ""]);
    expect(r.listings[0]).toMatchObject({ area: "كينج مريوط", status: "بيع", size: 0, title: "شقة قريبة من الطريق" });
  });
  it("North Coast listings need one of its areas", () => {
    const ok = sheet(["شاليه على البحر", "شاليه", "مصيف", "الساحل الشمالي", "مراسي", "3000", "", "", "", ""]);
    expect(ok.listings[0]).toMatchObject({ area: "مراسي", status: "مصيف" });
    expect(sheet(["شاليه", "شاليه", "مصيف", "الساحل الشمالي", "", "3000", "", "", "", ""]).listings).toHaveLength(0);
  });
  it("reports every problem with the sheet row number", () => {
    const r = sheet(
      ["x", "أرض", "إيجار", "برج العرب الجديدة", "الحي الأول", "1000", "", "", "", ""],
      ["x", "شقة", "بيع", "القاهرة", "", "0", "", "2.5", "", ""],
      ["x", "شقة", "بيع", "برج العرب الجديدة", "حي غلط", "100", "", "", "", ""],
    );
    expect(r.listings).toHaveLength(0);
    expect(r.errors.map((e) => e.row)).toEqual([2, 3, 4]);
    expect(r.errors[0]!.message).toContain("النوع");
    expect(r.errors[1]!.message).toContain("المدينة");
    expect(r.errors[1]!.message).toContain("السعر");
    expect(r.errors[1]!.message).toContain("الغرف");
    expect(r.errors[2]!.message).toContain("المنطقة");
  });
  it("needs the main columns and skips empty rows", () => {
    expect(parseListingsSheet([["العنوان", "السعر"]]).errors[0]!.message).toContain("النوع");
    expect(sheet(["", "", "", "", "", "", "", "", "", ""]).listings).toHaveLength(0);
  });
});
