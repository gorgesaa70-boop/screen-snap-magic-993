import { describe, expect, it } from "vitest";
import { cairoHour, isGreetingOnly, isWorkTime, listingIds, listingNumbers, listingText, menuChoice, unitCodes, welcome } from "@/lib/whatsapp-bot";

describe("WhatsApp bot: reading the customer's message", () => {
  it("finds listing codes written in different ways", () => {
    expect(listingNumbers("مرحبًا، أستفسر عن العقار كود VA-123:")).toEqual([123]);
    expect(listingNumbers("va 77 و VA-77")).toEqual([77]);
    expect(listingNumbers("كود ١٢٣")).toEqual([123]);
    expect(listingNumbers("عاوز شقة 3 غرف بـ 2000000")).toEqual([]);
  });

  it("finds property links sent by the site's buttons", () => {
    expect(listingIds("https://valueaqar.com/properties/41B9849E-A71B-4018-92BD-14C12403D9A2")).toEqual(["41b9849e-a71b-4018-92bd-14c12403d9a2"]);
    expect(listingIds("https://valueaqar.com/industrial/41b9849e-a71b-4018-92bd-14c12403d9a2")).toEqual(["41b9849e-a71b-4018-92bd-14c12403d9a2"]);
  });

  it("reads a mall unit's message: its VA code, not the mall link", () => {
    const msg = "مرحبًا، أستفسر عن وحدة محل 12 في جميرا — كود VA-210\nhttps://valueaqar.com/malls/41b9849e-a71b-4018-92bd-14c12403d9a2";
    expect(listingNumbers(msg)).toEqual([210]);
    expect(listingIds(msg)).toEqual([]);
  });

  it("finds project and compound unit codes", () => {
    expect(unitCodes("مرحبًا، أستفسر عن وحدة شقة في النخيل — كود VP-12")).toEqual([{ kind: "project", no: 12 }]);
    expect(unitCodes("vc 7 و VC-7 و vp٣")).toEqual([{ kind: "compound", no: 7 }, { kind: "project", no: 3 }]);
    expect(unitCodes("كود VA-12")).toEqual([]);
    expect(listingNumbers("كود VP-12")).toEqual([]);
  });

  it("reads menu choices by number (also Arabic digits) and by words", () => {
    expect(menuChoice("1")).toBe("search");
    expect(menuChoice("٢")).toBe("sell");
    expect(menuChoice(" 3 ")).toBe("human");
    expect(menuChoice("عايز اكلم موظف لو سمحت")).toBe("human");
    expect(menuChoice("عندي شقة للبيع")).toBe("sell");
    expect(menuChoice("عاوز شقة إيجار في برج العرب")).toBeNull();
    expect(menuChoice("13")).toBeNull();
  });

  it("tells a bare greeting from a real question", () => {
    expect(isGreetingOnly("السلام عليكم")).toBe(true);
    expect(isGreetingOnly("السلام عليكم ورحمة الله وبركاته")).toBe(true);
    expect(isGreetingOnly("Hi!")).toBe(true);
    expect(isGreetingOnly("السلام عليكم عاوز شقة")).toBe(false);
  });
});

describe("WhatsApp bot: replies", () => {
  it("greets by first name and shows the menu", () => {
    const w = welcome("أحمد محمد");
    expect(w).toContain("أهلاً أحمد");
    expect(w).toContain("1️⃣");
    expect(welcome(null)).toContain("أهلاً بيك");
  });

  it("writes a listing card with its link and never a broker's number", () => {
    const t = listingText({ id: "abc", code: "VA-5", type: "شقة", status: "إيجار", city: "برج العرب الجديدة", area: "الحي الأول", size: 120, rooms: 3, price: 8000, available: true });
    expect(t).toContain("*VA-5*");
    expect(t).toContain("شقة للإيجار");
    expect(t).toContain("https://valueaqar.com/properties/abc");
    expect(t).not.toMatch(/01[0125]\d{8}/);
    expect(listingText({ id: "x", code: null, type: "محل", status: "بيع", city: null, area: null, size: null, rooms: null, price: null, available: false })).toContain("مش متاح");
    expect(listingText({ id: "x", code: "VA-9", type: "محل", status: "بيع", city: null, area: null, size: null, rooms: null, price: null, available: true, path: "/malls/m1" })).toContain("https://valueaqar.com/malls/m1");
  });

  it("knows Cairo working hours", () => {
    const noonCairo = new Date("2026-10-19T09:00:00Z"); // 12:00 in Cairo (UTC+3)
    expect(cairoHour(noonCairo)).toBe(12);
    expect(isWorkTime({ start: 9, end: 21 }, noonCairo)).toBe(true);
    expect(isWorkTime({ start: 9, end: 21 }, new Date("2026-10-19T22:00:00Z"))).toBe(false);
  });
});
