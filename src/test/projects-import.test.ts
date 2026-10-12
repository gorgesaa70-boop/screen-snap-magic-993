import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { PROJECT_HEADERS, parseProjectsSheet } from "@/lib/projects-import";

const sheet = (rows: unknown[][], existing: string[] = []) => parseProjectsSheet([PROJECT_HEADERS, ...rows], existing);

describe("compounds import", () => {
  it("reads compounds with city, district and amenities", () => {
    const r = sheet([
      ["كمبوند النخيل", "برج العرب الجديده", "الحي الاول", "طريق المطار", "ديسمبر 2027", "10% مقدم و7 سنين", "أمن 24 ساعة، حمام سباحة,جراج", "وصف"],
      ["مراسي ريزيدنس", "الساحل الشمالي", "مراسي", "", "", "", "", ""],
    ]);
    expect(r.errors).toEqual([]);
    expect(r.projects.map((p) => [p.name, p.city, p.area, p.amenities.length])).toEqual([
      ["كمبوند النخيل", "برج العرب الجديدة", "الحي الأول", 3],
      ["مراسي ريزيدنس", "الساحل الشمالي", "مراسي", 0],
    ]);
  });
  it("refuses duplicates, unknown places and unknown amenities, with row numbers", () => {
    const r = sheet([
      ["كمبوند قديم", "برج العرب الجديدة", "الحي الأول", "", "", "", "", ""],
      ["كمبوند جديد", "القاهرة", "", "", "", "", "", ""],
      ["كمبوند تاني", "برج العرب الجديدة", "الحي الأول", "", "", "", "هليباد", ""],
      ["كمبوند تالت", "برج العرب الجديدة", "الحي الأول", "", "", "", "", ""],
      ["كمبوند تالت", "برج العرب الجديدة", "الحي الأول", "", "", "", "", ""],
    ], ["كمبوند قديم"]);
    expect(r.projects.map((p) => p.name)).toEqual(["كمبوند تالت"]);
    expect(r.errors.map((e) => e.row)).toEqual([2, 3, 4, 6]);
    expect(r.errors[2]!.message).toContain("هليباد");
  });
});
