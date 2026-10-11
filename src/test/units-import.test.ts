import { describe, expect, it } from "vitest";
import { parseCsv, parseUnitsSheet } from "@/lib/units-import";

describe("parseUnitsSheet", () => {
  const head = ["الكود", "النوع", "المساحة", "الغرف", "الحمامات", "الدور", "السعر", "الحالة", "ملاحظات"];

  it("reads Arabic headers, Arabic digits and status labels", () => {
    const r = parseUnitsSheet([head, ["A-1", "شقة", "١٢٠", 3, 2, "الثالث", "1,500,000", "محجوزة", ""]]);
    expect(r.errors).toEqual([]);
    expect(r.units[0]).toMatchObject({ code: "A-1", unit_type: "شقة", size: 120, rooms: 3, price: 1500000, status: "reserved", row: 2 });
  });

  it("reads Arabic thousands separators and decimal comma", () => {
    const r = parseUnitsSheet([head, ["P1", "فيلا", "٣٥٠٫٥", 5, 4, "", "٣٬٥٠٠٬٠٠٠", "مباعة", ""]]);
    expect(r.errors).toEqual([]);
    expect(r.units[0]).toMatchObject({ size: 350.5, price: 3500000, status: "sold" });
  });

  it("accepts English headers and defaults status to available", () => {
    const r = parseUnitsSheet([["Code", "Type", "Size", "Price"], ["B1", "Villa", 300, ""]]);
    expect(r.units[0]).toMatchObject({ code: "B1", status: "available", price: null });
  });

  it("reports each bad row with its sheet row number and keeps the good ones", () => {
    const r = parseUnitsSheet([head, ["X1", "شقة", "", "", "", "", "", "", ""], ["X2", "شقة", 90, 2.5, "", "", "abc", "مش عارف", ""], ["X3", "شقة", 100]]);
    expect(r.units.map((u) => u.code)).toEqual(["X3"]);
    expect(r.errors.map((e) => e.row)).toEqual([2, 3]);
    expect(r.errors[1]!.message).toContain("الغرف");
    expect(r.errors[1]!.message).toContain("السعر");
    expect(r.errors[1]!.message).toContain("الحالة");
  });

  it("blocks duplicate codes inside the file and codes already in the project", () => {
    const r = parseUnitsSheet([head, ["D1", "شقة", 100], ["d1", "شقة", 100], ["OLD", "شقة", 100]], ["old"]);
    expect(r.units.map((u) => u.code)).toEqual(["D1"]);
    expect(r.errors.map((e) => e.message)).toEqual([expect.stringContaining("متكرر (صف 2)"), expect.stringContaining("موجود في المشروع")]);
  });

  it("explains missing required columns and skips empty rows", () => {
    expect(parseUnitsSheet([["الكود", "السعر"], ["A", 1]]).errors[0]!.message).toContain("النوع");
    expect(parseUnitsSheet([head, ["", "", ""], ["Z", "شقة", 80]]).units).toHaveLength(1);
  });
});

describe("parseCsv", () => {
  it("handles quotes, commas and CRLF", () => {
    expect(parseCsv('﻿a,"b, c","d ""q"""\r\n1,2,3\r\n')).toEqual([["a", "b, c", 'd "q"'], ["1", "2", "3"]]);
  });
});
