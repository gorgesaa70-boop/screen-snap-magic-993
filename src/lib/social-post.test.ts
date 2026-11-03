import { describe, expect, it } from "vitest";
import { caption, cardFields, hashtags, shortTitle, type SocialListing } from "./social-post";

const house: SocialListing = {
  id: "f5eb62ec-5135-45d3-bb2f-bafe9ac9a5a6", listing_no: 207, title: "بيت للبيع في الحي التالت",
  description: "الحي التالت - مجاورة 2أ\nقطعة 59\nخلف الوحدة الصحية مباشر", type: "بيت", status: "بيع",
  city: "برج العرب الجديدة", area: "الحي الثالث", size: 209, rooms: 3, baths: 1, price: 3500000, price_unit: null,
  finishing: "super_lux", payment_method: "cash", down_payment: null, installment_years: null,
  images: ["https://x/p1.webp"], image_url: null,
};
const clinic: SocialListing = {
  ...house, id: "b12a7c5e", listing_no: 162, title: "عيادة 45.6 م² — الدور التالت — مجمع مدار الطبي", description: null,
  type: "عيادة", area: "مجمع مدار الطبي", size: 45.6, rooms: null, baths: null, price: 2052000, finishing: null,
  payment_method: "installment", down_payment: 513000, installment_years: 2, images: null, image_url: null,
};
const shopRent: SocialListing = { ...house, listing_no: 70, title: "محل للإيجار في الحي الأول", type: "محل", status: "إيجار", area: "الحي الأول", size: 22, rooms: null, baths: null, price: 8000, finishing: "full", payment_method: null, description: null };

describe("social caption", () => {
  it("has the listing's real details, code and link", () => {
    const c = caption(house);
    expect(c.startsWith("فاليو عقار\n")).toBe(true);
    expect(c).toContain("بيت للبيع في الحي التالت");
    expect(c).toContain("📍 برج العرب الجديدة – الحي الثالث");
    expect(c).toContain("٣٬٥٠٠٬٠٠٠ جنيه");
    expect(c).toContain("سعر المتر");
    expect(c).toContain("💳 كاش");
    expect(c).toContain("🛏️ 3 غرف");
    expect(c).toContain("🧱 التشطيب: سوبر لوكس");
    expect(c).toContain("مجاورة 2أ · قطعة 59");
    expect(c).toContain("🔖 كود العقار: VA-207");
    expect(c).toContain("https://valueaqar.com/properties/f5eb62ec-5135-45d3-bb2f-bafe9ac9a5a6");
    expect(c).not.toContain("حمّل التطبيق");
    expect(c).not.toMatch(/01\d{9}/);
  });
  it("shows installments and the app link when there is one", () => {
    const c = caption(clinic, { appUrl: "https://valueaqar.com/app" });
    expect(c).toContain("💳 تقسيط: مقدم 25% على سنتين");
    expect(c).toContain("45.6 م²");
    expect(c).toContain("📲 حمّل التطبيق: https://valueaqar.com/app");
  });
  it("marks monthly rent", () => {
    expect(caption(shopRent)).toContain("٨٬٠٠٠ جنيه شهريًا");
    expect(caption(shopRent)).not.toContain("سعر المتر");
  });
});

describe("hashtags", () => {
  it("are exactly 5 (Instagram's limit), unique and valid", () => {
    const chalet: SocialListing = { ...house, type: "شاليه", status: "مصيف", area: house.city };
    for (const l of [house, clinic, shopRent, chalet]) {
      const h = hashtags(l);
      expect(h.length).toBe(5);
      expect(new Set(h).size).toBe(h.length);
      for (const t of h) expect(t).toMatch(/^#[\p{L}\p{N}_]+$/u);
    }
  });
  it("cover the brand, type, purpose, area and city", () => {
    const h = hashtags(house);
    expect(h).toEqual(["#فاليو_عقار", "#بيوت_للبيع", "#برج_العرب_الجديدة", "#الحي_الثالث", "#عقارات_الإسكندرية"]);
    expect(hashtags(clinic)).toContain("#تقسيط");
    expect(hashtags(shopRent)).toContain("#محلات_للإيجار");
  });
});

describe("card fields", () => {
  it("fills the boxes from the listing", () => {
    const f = cardFields(house);
    expect(f).toMatchObject({ code: "VA-207", chip: "بيوت للبيع", size: "209 م²", specLabel: "المواصفات", spec: "3 غرف · 1 حمام", photo: "https://x/p1.webp" });
    expect(f.title).toBe("بيت للبيع في الحي التالت – برج العرب الجديدة");
    expect(f.place).toBe("برج العرب الجديدة - الحي الثالث - الحي التالت - مجاورة 2أ - قطعة 59");
    expect(f.price).toBe("٣٬٥٠٠٬٠٠٠ ج.م");
  });
  it("uses the payment plan when there are no rooms", () => {
    expect(cardFields(clinic)).toMatchObject({ specLabel: "نظام السداد", spec: "مقدم 25% · سنتين", chip: "عيادات للبيع", photo: null });
  });
  it("rent shows the unit; shops show the finishing", () => {
    expect(cardFields(shopRent)).toMatchObject({ price: "٨٬٠٠٠ ج.م / شهريًا", specLabel: "التشطيب", spec: "تشطيب كامل", chip: "محلات للإيجار" });
  });
  it("TikTok title stays short", () => {
    expect(shortTitle({ ...house, title: "ب".repeat(200) }).length).toBeLessThanOrEqual(90);
  });
});
