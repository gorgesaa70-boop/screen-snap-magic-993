/** Validation for importing project units from an Excel / CSV sheet (item 16). Pure functions — no I/O. */

export type UnitInput = {
  code: string | null;
  unit_type: string;
  size: number;
  rooms: number | null;
  baths: number | null;
  floor: string | null;
  price: number | null;
  status: "available" | "reserved" | "sold" | "unavailable";
  notes: string | null;
};
export type ImportError = { row: number; message: string };
export type ImportResult = { units: (UnitInput & { row: number })[]; errors: ImportError[] };

type Field = keyof UnitInput;
/** Accepted column titles (Arabic or English, any case / spacing). */
const HEADERS: Record<Field, string[]> = {
  code: ["الكود", "كود", "كود الوحدة", "رقم الوحدة", "code", "unit code"],
  unit_type: ["النوع", "نوع الوحدة", "type", "unit type"],
  size: ["المساحة", "المساحة م2", "المساحة (م²)", "size", "area", "m2"],
  rooms: ["الغرف", "عدد الغرف", "rooms", "bedrooms"],
  baths: ["الحمامات", "عدد الحمامات", "baths", "bathrooms"],
  floor: ["الدور", "floor"],
  price: ["السعر", "السعر (ج.م)", "price"],
  status: ["الحالة", "status"],
  notes: ["ملاحظات", "notes"],
};
const STATUS: Record<string, UnitInput["status"]> = {
  "متاحة": "available", "متاح": "available", available: "available",
  "محجوزة": "reserved", "محجوز": "reserved", reserved: "reserved",
  "مباعة": "sold", "مباع": "sold", sold: "sold",
  "غير متاحة": "unavailable", "غير متاح": "unavailable", unavailable: "unavailable",
};
export const MAX_ROWS = 1000;
export const TEMPLATE_HEADERS = ["الكود", "النوع", "المساحة", "الغرف", "الحمامات", "الدور", "السعر", "الحالة", "ملاحظات"];

const norm = (v: unknown) => String(v ?? "").replace(/[‏‎]/g, "").trim();
const key = (v: unknown) => norm(v).toLowerCase().replace(/\s+/g, " ");
const toLatinDigits = (s: string) => s.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[,،٬\s]/g, "").replace(/٫/g, ".");

function num(v: unknown): number | null | "bad" {
  if (v === null || v === undefined || norm(v) === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : "bad";
  const n = Number(toLatinDigits(norm(v)));
  return Number.isFinite(n) ? n : "bad";
}

/** Rows (first row = headers) → valid units + errors with 1-based sheet row numbers. Duplicate codes are rejected. */
export function parseUnitsSheet(rows: unknown[][], existingCodes: Iterable<string> = []): ImportResult {
  const errors: ImportError[] = [];
  const units: ImportResult["units"] = [];
  const header = (rows[0] ?? []).map(key);
  const col = {} as Record<Field, number>;
  for (const f of Object.keys(HEADERS) as Field[]) col[f] = header.findIndex((h) => HEADERS[f].some((a) => a.toLowerCase() === h));
  const missing = (["unit_type", "size"] as Field[]).filter((f) => col[f] < 0);
  if (missing.length) {
    return { units, errors: [{ row: 1, message: `الملف ناقصه عمود: ${missing.map((f) => HEADERS[f][0]).join("، ")}` }] };
  }
  const data = rows.slice(1);
  if (data.length > MAX_ROWS) return { units, errors: [{ row: 1, message: `الملف فيه أكتر من ${MAX_ROWS} صف — قسّمه على أكتر من ملف` }] };
  const seen = new Map<string, number>([...existingCodes].map((c) => [c.toLowerCase(), 0]));

  data.forEach((r, i) => {
    const row = i + 2;
    const cell = (f: Field) => (col[f] >= 0 ? r[col[f]] : null);
    if (r.every((v) => norm(v) === "")) return;
    const problems: string[] = [];
    const unit_type = norm(cell("unit_type"));
    if (unit_type.length < 2 || unit_type.length > 50) problems.push("النوع ناقص");
    const size = num(cell("size"));
    if (size === null || size === "bad" || size <= 0) problems.push("المساحة لازم رقم أكبر من صفر");
    const rooms = num(cell("rooms")); const baths = num(cell("baths"));
    for (const [n, v] of [["الغرف", rooms], ["الحمامات", baths]] as const) {
      if (v === "bad" || (typeof v === "number" && (!Number.isInteger(v) || v < 0 || v > 50))) problems.push(`${n} لازم رقم صحيح من 0 لـ 50`);
    }
    const price = num(cell("price"));
    if (price === "bad" || (typeof price === "number" && price < 0)) problems.push("السعر لازم رقم");
    const statusRaw = key(cell("status"));
    const status = statusRaw ? STATUS[statusRaw] : "available";
    if (!status) problems.push(`الحالة «${norm(cell("status"))}» مش معروفة (متاحة / محجوزة / مباعة / غير متاحة)`);
    const code = norm(cell("code")) || null;
    if (code && code.length > 50) problems.push("الكود أطول من 50 حرف");
    if (code) {
      const prev = seen.get(code.toLowerCase());
      if (prev === 0) problems.push(`الكود ${code} موجود في المشروع بالفعل`);
      else if (prev) problems.push(`الكود ${code} متكرر (صف ${prev})`);
      else seen.set(code.toLowerCase(), row);
    }
    if (problems.length) { errors.push({ row, message: problems.join(" · ") }); return; }
    units.push({
      row, code, unit_type, size: size as number, rooms: rooms as number | null, baths: baths as number | null,
      floor: norm(cell("floor")).slice(0, 50) || null, price: price as number | null, status: status!, notes: norm(cell("notes")).slice(0, 1000) || null,
    });
  });
  return { units, errors };
}

/** Minimal CSV reader (quotes, commas, CRLF) for files saved from Excel as CSV. */
export function parseCsv(text: string): string[][] {
  const out: string[][] = []; let row: string[] = []; let cur = ""; let q = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (q) {
      if (ch === '"' && src[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cur); cur = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && src[i + 1] === "\n") i++; row.push(cur); out.push(row); row = []; cur = ""; }
    else cur += ch;
  }
  if (cur !== "" || row.length) { row.push(cur); out.push(row); }
  return out;
}
