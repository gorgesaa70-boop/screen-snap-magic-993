import type { Property } from "./data";

export type Filters = { type: string; status: string; area: string; min: string; max: string; city?: string; group?: string };
export const emptyFilters: Filters = { type: "", status: "", area: "", min: "", max: "", city: "", group: "" };

/** Category groups shown on the home page and header. Values are canonical Arabic property types. */
export const TYPE_GROUPS: Record<string, string[]> = {
  land: ["أرض"],
  residential: ["شقة", "فيلا", "دوبلكس"],
  commercial: ["محل"],
  office: ["مكتب"],
};
export const GROUP_LABELS: Record<string, string> = { land: "أراضي", residential: "سكني", commercial: "تجاري", office: "إداري" };

export const isEmpty = (f: Filters) => Object.values(f).every((v) => v === "");

export function applyFilters(list: Property[], f: Filters) {
  const min = f.min ? Number(f.min) : null;
  const max = f.max ? Number(f.max) : null;
  return list.filter(
    (p) =>
      (!f.type || p.type === f.type) &&
      (!f.group || (TYPE_GROUPS[f.group] ?? []).includes(p.type)) &&
      (!f.status || p.status === f.status) &&
      (!f.city || p.city === f.city) &&
      (!f.area || p.area === f.area) &&
      (min === null || p.price >= min) &&
      (max === null || p.price <= max),
  );
}
