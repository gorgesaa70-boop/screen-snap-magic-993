import type { Property } from "./data";

/** «فلاتر أكتر»: pay = "installment" (installments only), maxDown = highest down payment, rooms = at least, finishing. */
export type Filters = { type: string; status: string; area: string; min: string; max: string; city?: string; group?: string; pay?: string; maxDown?: string; rooms?: string; finishing?: string; place?: string };
export const emptyFilters: Filters = { type: "", status: "", area: "", min: "", max: "", city: "", group: "", pay: "", maxDown: "", rooms: "", finishing: "", place: "" };
/** How many of the extra filters are set (shown on the «فلاتر أكتر» button). */
export const extraCount = (f: Filters) => [f.pay, f.maxDown, f.rooms, f.finishing].filter(Boolean).length;

/** Category groups shown on the home page and header. Values are canonical Arabic property types. */
export const TYPE_GROUPS: Record<string, string[]> = {
  land: ["أرض"],
  residential: ["شقة", "فيلا", "دوبلكس", "بيت", "عمارة", "استوديو", "شاليه"],
  commercial: ["محل"],
  office: ["مكتب", "عيادة"],
};
export const GROUP_LABELS: Record<string, string> = { land: "أراضي", residential: "سكني", commercial: "تجاري", office: "إداري" };

export const isEmpty = (f: Filters) => Object.values(f).every((v) => !v);

/** Loose Arabic compare for typed places (أ/ا، ة/ه، ى/ي, spaces). */
const loosePlace = (s: string) => s.trim().replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/\s+/g, " ").toLowerCase();

export function applyFilters(list: Property[], f: Filters) {
  const place = f.place ? loosePlace(f.place) : "";
  const min = f.min ? Number(f.min) : null;
  const max = f.max ? Number(f.max) : null;
  const maxDown = f.maxDown ? Number(f.maxDown) : null;
  const rooms = f.rooms ? Number(f.rooms) : null;
  return list.filter(
    (p) =>
      (!f.type || p.type === f.type) &&
      (!f.group || (TYPE_GROUPS[f.group] ?? []).includes(p.type)) &&
      (!f.status || p.status === f.status) &&
      (!f.city || p.city === f.city) &&
      (!f.area || p.area === f.area) &&
      (min === null || p.price >= min) &&
      (max === null || p.price <= max) &&
      (!f.pay || !!p.installments) &&
      (maxDown === null || (!!p.installments && (p.installments.down ?? 0) <= maxDown)) &&
      (rooms === null || (p.rooms ?? 0) >= rooms) &&
      (!f.finishing || p.finishing === f.finishing) &&
      (!place || loosePlace(`${p.city} ${p.area}`).includes(place)),
  );
}
