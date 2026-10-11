import { describe, it, expect } from "vitest";
import { PAGE, fetchAll } from "@/lib/fetch-all";

const table = (n: number) => Array.from({ length: n }, (_, i) => i);
const api = (rows: number[], calls: [number, number][] = []) => (from: number, to: number) => {
  calls.push([from, to]);
  return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
};

describe("fetchAll (item 38)", () => {
  it("returns everything beyond the 1,000-row page limit", async () => {
    const calls: [number, number][] = [];
    const r = await fetchAll(api(table(2500), calls));
    expect(r).toHaveLength(2500);
    expect(calls).toEqual([[0, PAGE - 1], [PAGE, 2 * PAGE - 1], [2 * PAGE, 3 * PAGE - 1]]);
  });
  it("one request for small tables, and an extra empty one at exact multiples", async () => {
    const small: [number, number][] = [];
    await fetchAll(api(table(10), small));
    expect(small).toHaveLength(1);
    const exact: [number, number][] = [];
    expect(await fetchAll(api(table(PAGE), exact))).toHaveLength(PAGE);
    expect(exact).toHaveLength(2);
  });
  it("stops on errors", async () => {
    await expect(fetchAll(() => Promise.resolve({ data: null, error: new Error("boom") }))).rejects.toThrow("boom");
  });
});
