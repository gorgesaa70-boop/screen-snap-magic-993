import type { Property } from "./data";

export type Filters = { type: string; status: string; area: string; min: string; max: string; city?: string };
export const emptyFilters: Filters = { type: "", status: "", area: "", min: "", max: "", city: "" };

export const isEmpty = (f: Filters) => Object.values(f).every((v) => v === "");

export function applyFilters(list: Property[], f: Filters) {
  const min = f.min ? Number(f.min) : null;
  const max = f.max ? Number(f.max) : null;
  return list.filter(
    (p) =>
      (!f.type || p.type === f.type) &&
      (!f.status || p.status === f.status) &&
      (!f.city || p.city === f.city) &&
      (!f.area || p.area === f.area) &&
      (min === null || p.price >= min) &&
      (max === null || p.price <= max),
  );
}
