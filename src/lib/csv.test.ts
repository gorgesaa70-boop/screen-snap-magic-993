import { expect, it } from "vitest";
import { csvCell } from "./csv";
it("neutralizes formulas", () => expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)"));
it("keeps numbers", () => expect(csvCell(-5)).toBe("-5"));
it("quotes commas", () => expect(csvCell("a,b")).toBe('"a,b"'));
