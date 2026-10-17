import { describe, it, expect } from "vitest";
import { extractLoginCodes, loginLink, loginMessage, WHATSAPP_LOGIN_NUMBER } from "@/lib/whatsapp-login";

describe("extractLoginCodes", () => {
  it("finds the code in the pre-filled message", () => expect(extractLoginCodes(loginMessage("048213"))).toEqual(["048213"]));
  it("accepts Arabic digits and spaces/dashes inside the code", () => {
    expect(extractLoginCodes("كودي ٠٤٨٢١٣")).toEqual(["048213"]);
    expect(extractLoginCodes("048 213")).toEqual(["048213"]);
    expect(extractLoginCodes("048-213")).toEqual(["048213"]);
  });
  it("ignores shorter and longer numbers (prices, phones)", () => {
    expect(extractLoginCodes("السعر 12345 جنيه")).toEqual([]);
    expect(extractLoginCodes("رقمي 01124812195")).toEqual([]);
    expect(extractLoginCodes("2500000")).toEqual([]);
  });
  it("returns at most 3 distinct codes", () => expect(extractLoginCodes("111111، 222222، 111111، 333333، 444444")).toEqual(["111111", "222222", "333333"]));
  it("handles empty text", () => {
    expect(extractLoginCodes(null)).toEqual([]);
    expect(extractLoginCodes("")).toEqual([]);
  });
});

describe("loginLink", () => {
  it("opens WhatsApp on Value Aqar's API number with the message pre-filled", () => {
    const url = new URL(loginLink("123456"));
    expect(url.pathname).toBe(`/${WHATSAPP_LOGIN_NUMBER}`);
    expect(url.searchParams.get("text")).toBe(loginMessage("123456"));
  });
});
