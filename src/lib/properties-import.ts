/** Item 32: validation for importing a company's / broker's listings from an Excel or CSV sheet. Pure functions — no I/O. */
import { CITY_NAMES, TYPES_FOR, areasOf } from "@/components/site/data";
import { key, norm, num } from "./units-import";

export type ListingInput = {
  title: string;
  type: string;
  status: "بيع" | "إيجار" | "مصيف";
  city: string;
  area: string;
  price: number;
  size: number;
  rooms: number | null;
  baths: number | null;
  finishing: string | null;
  description: string | null;
};
export type ListingImport = { listings: (ListingInput & { row: number })[]; errors: { row: number; message: string }[] };

type Field = keyof ListingInput;
const HEADERS: Record<Field, string[]> = {
  title: ["العنوان", "عنوان الإعلان", "اسم العقار", "title"],
  type: ["النوع", "نوع العقار", "type"],
  status: ["الغرض", "بيع أو إيجار", "purpose", "status"],
  city: ["المدينة", "city"],
  area: ["المنطقة", "الحي", "area", "district"],
  price: ["السعر", "السعر (ج.م)", "price"],
  size: ["المساحة", "المساحة م2", "المساحة (م²)", "size", "m2"],
  rooms: ["الغرف", "عدد الغرف", "rooms", "bedrooms"],
  baths: ["الحمامات", "عدد الحمامات", "baths", "bathrooms"],
  finishing: ["التشطيب", "حالة التشطيب", "finishing"],
  description: ["الوصف", "التفاصيل", "description"],
};
const PURPOSE: Record<string, ListingInput["status"]> = {
  "بيع": "بيع", "للبيع": "بيع", sale: "بيع", sell: "بيع",
  "إيجار": "إيجار", "ايجار": "إيجار", "للإيجار": "إيجار", "للايجار": "إيجار", rent: "إيجار",
  "مصيف": "مصيف", "إيجار مصيفي": "مصيف", "ايجار مصيفي": "مصيف", summer: "مصيف",
};
export const MAX_LISTINGS = 500;
export const LISTING_HEADERS = ["العنوان", "النوع", "الغرض", "المدينة", "المنطقة", "السعر", "المساحة", "الغرف", "الحمامات", "الوصف", "التشطيب"];
/** Finishing words people write in sheets → properties.finishing. Blank is allowed. */
const FINISHING: Record<string, string> = {
  "عمدان": "skeleton", "طوب احمر": "skeleton", "عمدان / طوب احمر": "skeleton", "على الطوب": "skeleton", "علي الطوب": "skeleton", skeleton: "skeleton",
  "نص تشطيب": "semi", "نصف تشطيب": "semi", "نص": "semi", semi: "semi",
  "تشطيب كامل": "full", "كامل": "full", "متشطب": "full", "متشطبه": "full", full: "full",
  "سوبر لوكس": "super_lux", "لوكس": "super_lux", "الترا لوكس": "super_lux", "super lux": "super_lux",
};
/** Arabic letters vary in spelling (أ/ا, ة/ه, ى/ي): compare loosely, store the canonical value. */
const loose = (s: string) => key(s).replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي");
const pick = (v: string, list: string[]) => list.find((x) => loose(x) === loose(v));

/** Rows (first row = headers) → valid listings + errors with 1-based sheet row numbers. */
export function parseListingsSheet(rows: unknown[][]): ListingImport {
  const errors: ListingImport["errors"] = [];
  const listings: ListingImport["listings"] = [];
  const header = (rows[0] ?? []).map(key);
  const col = {} as Record<Field, number>;
  for (const f of Object.keys(HEADERS) as Field[]) col[f] = header.findIndex((h) => HEADERS[f].some((a) => a.toLowerCase() === h));
  const missing = (["type", "status", "city", "price"] as Field[]).filter((f) => col[f] < 0);
  if (missing.length) return { listings, errors: [{ row: 1, message: `الملف ناقصه عمود: ${missing.map((f) => HEADERS[f][0]).join("، ")}` }] };
  const data = rows.slice(1);
  if (data.length > MAX_LISTINGS) return { listings, errors: [{ row: 1, message: `الملف فيه أكتر من ${MAX_LISTINGS} صف — قسّمه على أكتر من ملف` }] };

  data.forEach((r, i) => {
    const row = i + 2;
    if (r.every((v) => norm(v) === "")) return;
    const cell = (f: Field) => (col[f] >= 0 ? r[col[f]] : null);
    const problems: string[] = [];
    const status = PURPOSE[key(cell("status"))] ?? PURPOSE[loose(norm(cell("status")))];
    if (!status) problems.push(`الغرض «${norm(cell("status"))}» مش معروف (بيع / إيجار / مصيف)`);
    const type = pick(norm(cell("type")), TYPES_FOR[status ?? ""] ?? TYPES_FOR[""]!);
    if (!type) problems.push(`النوع «${norm(cell("type"))}» مش متاح${status ? ` لـ${status}` : ""} (${(TYPES_FOR[status ?? ""] ?? []).join(" / ")})`);
    const city = pick(norm(cell("city")), CITY_NAMES);
    if (!city) problems.push(`المدينة «${norm(cell("city"))}» مش في المدن المتاحة (${CITY_NAMES.join(" / ")})`);
    let area = city ?? "";
    // Cities with districts need one; cities without districts store the city name as the area.
    if (city && areasOf(city)[0] !== city) {
      const a = pick(norm(cell("area")), areasOf(city));
      if (!a) problems.push(`المنطقة «${norm(cell("area"))}» مش من مناطق ${city}`);
      else area = a;
    }
    const price = num(cell("price"));
    if (price === null || price === "bad" || price <= 0) problems.push("السعر لازم رقم أكبر من صفر");
    const size = num(cell("size"));
    if (size === "bad" || (typeof size === "number" && size < 0)) problems.push("المساحة لازم رقم");
    const rooms = num(cell("rooms")), baths = num(cell("baths"));
    for (const [n, v] of [["الغرف", rooms], ["الحمامات", baths]] as const) {
      if (v === "bad" || (typeof v === "number" && (!Number.isInteger(v) || v < 0 || v > 50))) problems.push(`${n} لازم رقم صحيح من 0 لـ 50`);
    }
    const finText = norm(cell("finishing"));
    const finishing = !finText || type === "أرض" ? null : FINISHING[loose(finText)] ?? null;
    if (finText && type !== "أرض" && !finishing) problems.push(`التشطيب «${finText}» مش معروف (عمدان / نص تشطيب / تشطيب كامل / سوبر لوكس)`);
    const description = norm(cell("description")).slice(0, 2000) || null;
    const title = (norm(cell("title")) || [type, status === "مصيف" ? "مصيف" : status && `لل${status}`, area && `في ${area}`].filter(Boolean).join(" ")).slice(0, 150);
    if (problems.length) { errors.push({ row, message: problems.join(" · ") }); return; }
    listings.push({ row, title, type: type!, status: status!, city: city!, area, price: price as number, size: (size as number | null) ?? 0, rooms: rooms as number | null, baths: baths as number | null, finishing, description });
  });
  return { listings, errors };
}
