import { describe, expect, it } from "vitest";
import { formatWorkMinutes, workMinutes } from "@/lib/response-time";

// Cairo is UTC+3 on these October 2026 dates (daylight saving) and UTC+2 in January.
describe("workMinutes (same rule as the database)", () => {
  it("counts only 9:00–21:00 Cairo", () => {
    expect(workMinutes("2026-10-12T06:00:00+03:00", "2026-10-12T10:30:00+03:00")).toBe(90);
    expect(workMinutes("2026-10-12T20:30:00+03:00", "2026-10-13T09:30:00+03:00")).toBe(60);
    expect(workMinutes("2026-10-12T22:00:00+03:00", "2026-10-13T08:00:00+03:00")).toBe(0);
  });
  it("handles winter time and several days", () => {
    expect(workMinutes("2026-01-05T20:00:00+02:00", "2026-01-07T10:00:00+02:00")).toBe(60 + 720 + 60);
  });
  it("custom hours and empty ranges", () => {
    expect(workMinutes("2026-10-12T00:00:00+03:00", "2026-10-12T02:00:00+03:00", { start: 0, end: 24 })).toBe(120);
    expect(workMinutes("2026-10-12T10:00:00+03:00", "2026-10-12T09:00:00+03:00")).toBe(0);
  });
  it("formats", () => {
    expect(formatWorkMinutes(45)).toBe("45 دقيقة");
    expect(formatWorkMinutes(190)).toBe("3 ساعات و10 دقيقة");
    expect(formatWorkMinutes(120)).toBe("ساعتين");
  });
});
