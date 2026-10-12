import { describe, expect, it } from "vitest";
import { ARABIC_DIGITS, latinDigit, toLatinDigits } from "@/lib/digits";
import { normalizePhone } from "@/lib/broker-login";

describe("Arabic keyboard digits", () => {
  it("number fields keep Arabic and Persian digits", () => {
    expect("١٥٠٠ ج".replace(ARABIC_DIGITS, latinDigit).replace(/\D/g, "")).toBe("1500");
    expect("۲۵۰۰".replace(ARABIC_DIGITS, latinDigit).replace(/\D/g, "")).toBe("2500");
    expect(toLatinDigits("٢٫٥")).toBe("2.5");
  });
  it("phone numbers typed in Arabic digits normalize", () => {
    expect(normalizePhone("٠١٠١٢٣٤٥٦٧٨")).toBe("201012345678");
  });
});
