import { describe, it, expect } from "vitest";
import { availabilityOf, byAvailability, isAvailable } from "@/components/site/availability";

describe("listing availability", () => {
  it("rows from before release 30 (no column) count as available", () => {
    expect(availabilityOf({})).toBe("available");
    expect(availabilityOf({ availability: null })).toBe("available");
    expect(isAvailable({ availability: "something else" })).toBe(true);
  });
  it("reserved and sold are not available", () => {
    expect(isAvailable({ availability: "reserved" })).toBe(false);
    expect(isAvailable({ availability: "sold" })).toBe(false);
  });
  it("sorts available first, then reserved, then sold", () => {
    const list = [{ id: 1, availability: "sold" }, { id: 2 }, { id: 3, availability: "reserved" }, { id: 4, availability: "available" }];
    expect([...list].sort(byAvailability).map((x) => x.id)).toEqual([2, 4, 3, 1]);
  });
});
