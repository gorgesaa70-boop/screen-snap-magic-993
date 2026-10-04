/**
 * Links validated AI search output to the existing filter system.
 * Pure helpers only — the traditional search path never calls the AI.
 */
import type { Property } from "./data";
import { applyFilters, emptyFilters, type Filters } from "./search";
import type { ParsedSearch } from "@/lib/search-parse";

export type SmartOutcome =
  | { kind: "industrial" }
  | { kind: "ambiguous" }
  | { kind: "apply"; filters: Filters; count: number; unsupported: string[]; suggestion: Filters | null };

/** Widens filters step by step (price, then area, then status) until results appear. */
export function suggestRelaxed(list: Property[], f: Filters): Filters | null {
  const steps: (keyof Filters)[][] = [["min", "max"], ["area"], ["status"]];
  let cur = { ...f };
  for (const keys of steps) {
    if (keys.every((k) => !cur[k])) continue;
    cur = { ...cur, ...Object.fromEntries(keys.map((k) => [k, ""])) };
    if (applyFilters(list, cur).length > 0) return cur;
  }
  return null;
}

export function resolveSmart(parsed: ParsedSearch, list: Property[]): SmartOutcome {
  if (parsed.category === "industrial") return { kind: "industrial" };
  if (parsed.ambiguous) return { kind: "ambiguous" };
  const filters = { ...emptyFilters, ...parsed.filters };
  const count = applyFilters(list, filters).length;
  return { kind: "apply", filters, count, unsupported: parsed.unsupported, suggestion: count === 0 ? suggestRelaxed(list, filters) : null };
}
