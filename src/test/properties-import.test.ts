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
      ["x", "شقة", "بيع", "", "", "0", "", "2.5", "", ""],
      ["x", "شقة", "بيع", "برج العرب الجديدة", "", "100", "", "", "", ""],
    );
    expect(r.listings).toHaveLength(0);
    expect(r.errors.map((e) => e.row)).toEqual([2, 3, 4]);
    expect(r.errors[0]!.message).toContain("النوع");
    expect(r.errors[1]!.message).toContain("المدينة");
    expect(r.errors[1]!.message).toContain("السعر");
    expect(r.errors[1]!.message).toContain("الغرف");
    expect(r.errors[2]!.message).toContain("المنطقة");
  });
  it("keeps a new city or area as written and lists it for the admin", () => {
    const r = sheet(
      ["", "شقة", "بيع", "الإسكندرية", "سموحة", "2000000", "", "", "", ""],
      ["", "شقة", "بيع", "برج العرب الجديدة", "الحي العاشر", "900000", "", "", "", ""],
      ["", "شقة", "بيع", "العامرية", "", "700000", "", "", "", ""],
    );
    expect(r.errors).toEqual([]);
    expect(r.listings.map((l) => [l.city, l.area])).toEqual([["الإسكندرية", "سموحة"], ["برج العرب الجديدة", "الحي العاشر"], ["العامرية", "العامرية"]]);
    expect(r.newPlaces).toEqual(["سموحة، الإسكندرية", "الحي العاشر، برج العرب الجديدة", "العامرية"]);
  });
  it("needs the main columns and skips empty rows", () => {
    expect(parseListingsSheet([["العنوان", "السعر"]]).errors[0]!.message).toContain("النوع");
    expect(sheet(["", "", "", "", "", "", "", "", "", ""]).listings).toHaveLength(0);
  });
});

describe("listings import: installments", () => {
  const row = (pay: string, down: string, years: string, monthly = "") => ["", "شقة", "بيع", "برج العرب الجديدة", "الحي الأول", "2000000", "", "", "", "", "", pay, down, years, monthly];
  it("reads cash / installments / both", () => {
    const r = sheet(row("كاش", "", ""), row("تقسيط", "300000", "5", "28500"), row("كاش أو تقسيط", "", "7"));
    expect(r.errors).toEqual([]);
    expect(r.listings.map((l) => [l.payment_method, l.down_payment, l.installment_years, l.monthly_installment])).toEqual([
      ["cash", null, null, null], ["installment", 300000, 5, 28500], ["both", null, 7, null],
    ]);
  });
  it("needs the years and a down payment below the price", () => {
    const r = sheet(row("تقسيط", "100000", ""), row("تقسيط", "2000000", "5"), row("بالشيك", "", ""));
    expect(r.listings).toHaveLength(0);
    expect(r.errors.map((e) => e.message.includes("سنين") || e.message.includes("المقدم") || e.message.includes("طريقة الدفع"))).toEqual([true, true, true]);
  });
});

describe("listings import: finishing", () => {
  it("reads the finishing column and ignores it for land", () => {
    const r = sheet(
      ["", "شقة", "بيع", "برج العرب الجديدة", "الحي الأول", "900000", "100", "", "", "", "نص تشطيب"],
      ["", "بيت", "بيع", "برج العرب الجديدة", "الحي الثاني", "2000000", "200", "", "", "", "على الطوب"],
      ["", "أرض", "بيع", "برج العرب الجديدة", "الحي الثالث", "500000", "300", "", "", "", "كامل"],
    );
    expect(r.errors).toEqual([]);
    expect(r.listings.map((l) => l.finishing)).toEqual(["semi", "skeleton", null]);
  });
  it("reports an unknown finishing word", () => {
    const r = sheet(["", "شقة", "بيع", "برج العرب الجديدة", "الحي الأول", "900000", "100", "", "", "", "فاخر جدا"]);
    expect(r.listings).toHaveLength(0);
    expect(r.errors[0]!.message).toContain("التشطيب");
  });
});
