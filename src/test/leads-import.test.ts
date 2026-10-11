import { describe, it, expect } from "vitest";
import { LEAD_HEADERS, parseLeadsSheet } from "@/lib/leads-import";

const sheet = (rows: unknown[][], existing: string[] = []) => parseLeadsSheet([LEAD_HEADERS, ...rows], existing);

describe("leads import (CRM)", () => {
  it("reads a customer and maps the source", () => {
    const r = sheet([["منى علي", "0101 234 5678", "فيسبوك", "حملة أكتوبر", "شقة", "الحي الأول", "١٬٥٠٠٬٠٠٠", "عايزة 3 غرف"]]);
    expect(r.errors).toEqual([]);
    expect(r.leads[0]).toMatchObject({ row: 2, name: "منى علي", phoneNorm: "201012345678", source: "facebook", campaign: "حملة أكتوبر", budget: 1500000 });
  });
  it("unknown source → excel", () => expect(sheet([["أحمد", "01012345679", "معرض", "", "", "", "", ""]]).leads[0]!.source).toBe("excel"));
  it("flags duplicates in the file and against the platform, never merges", () => {
    const r = sheet([
      ["أمل", "01011111111", "", "", "", "", "", ""],
      ["بسمة", "+20 101 111 1111", "", "", "", "", "", ""],
      ["جمال", "01022222222", "", "", "", "", "", ""],
    ], ["201022222222"]);
    expect(r.leads.map((l) => l.row)).toEqual([2]);
    expect(r.duplicates.map((d) => [d.row, d.reason])).toEqual([[3, "نفس رقم صف 2"], [4, "الرقم متسجّل في المنصة"]]);
  });
  it("reports bad rows and missing columns", () => {
    const r = sheet([["x", "123", "", "", "", "", "abc", ""]]);
    expect(r.errors[0]!.message).toContain("الاسم");
    expect(r.errors[0]!.message).toContain("الموبايل");
    expect(r.errors[0]!.message).toContain("الميزانية");
    expect(parseLeadsSheet([["الاسم"]]).errors[0]!.message).toContain("الموبايل");
  });
});
