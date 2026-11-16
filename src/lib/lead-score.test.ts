import { describe, expect, it } from "vitest";
import { parseLeadScore } from "./lead-score.server";

describe("parseLeadScore", () => {
  it("clamps score to 0-100", () => expect(parseLeadScore('{"score":140,"summary":"x","worth_call":true}')?.score).toBe(100));
  it("keeps the call flag", () => expect(parseLeadScore('{"score":80,"summary":"جاد","worth_call":true}')?.worth_call).toBe(true));
  it("rejects bad output", () => expect(parseLeadScore("not json")).toBeNull());
});
