import { describe, expect, it } from "vitest";
import { cleanPhone } from "@/lib/phone";

describe("cleanPhone", () => {
  it("accepts Egyptian mobiles in any common shape", () => {
    expect(cleanPhone("01012345678")).toBe("01012345678");
    expect(cleanPhone("+20 101 234 5678")).toBe("01012345678");
    expect(cleanPhone("00201512345678")).toBe("01512345678");
    expect(cleanPhone("201111111111")).toBe("01111111111");
    expect(cleanPhone("٠١٢٢٤٨٨١٢١٩")).toBe("01224881219");
  });
  it("rejects numbers that can't be Egyptian mobiles", () => {
    for (const bad of ["0112482195", "0122483646198", "011111111111", "01312345678", "12345678", "+20112482195", ""]) expect(cleanPhone(bad)).toBeNull();
  });
  it("accepts foreign numbers only with + or 00", () => {
    expect(cleanPhone("+966 50 123 4567")).toBe("+966501234567");
    expect(cleanPhone("00971501234567")).toBe("+971501234567");
    expect(cleanPhone("966501234567")).toBeNull();
  });
});
