import { describe, expect, it } from "vitest";
import { contactLeak, ownerReplyText } from "@/lib/wa-owner";

describe("owner replies stay on the platform", () => {
  it("blocks phone numbers in any shape", () => {
    expect(contactLeak("كلمني على 01012345678")).toBe(true);
    expect(contactLeak("010 1234 5678")).toBe(true);
    expect(contactLeak("010-1234-5678")).toBe(true);
    expect(contactLeak("٠١٠١٢٣٤٥٦٧٨")).toBe(true);
    expect(contactLeak("+201012345678")).toBe(true);
    expect(contactLeak("+965 9999 8888")).toBe(true);
  });
  it("blocks WhatsApp links and emails", () => {
    expect(contactLeak("https://wa.me/201012345678")).toBe(true);
    expect(contactLeak("ابعتلي على ahmed@gmail.com")).toBe(true);
  });
  it("lets normal replies through, prices and listing codes included", () => {
    expect(contactLeak("أيوه متاحة، السعر 12,500,000 ج.م")).toBe(false);
    expect(contactLeak("السعر 2.650.000 والمساحة 130 م²")).toBe(false);
    expect(contactLeak("شوف كمان VA-184 في الحي الأول")).toBe(false);
    expect(contactLeak("المعاينة يوم 15/11 الساعة 5")).toBe(false);
  });
  it("tells the customer who is answering", () => {
    expect(ownerReplyText("شركة النخبة", " أيوه متاحة ")).toBe("*شركة النخبة* (عبر فاليو عقار):\nأيوه متاحة");
  });
});
