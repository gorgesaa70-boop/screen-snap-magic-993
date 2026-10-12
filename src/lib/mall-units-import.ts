import { ARABIC_DIGITS, latinDigit } from "@/lib/digits";
import { MALL_FLOORS, MALL_UNIT_TYPES } from "@/components/site/malls";

/** One mall unit from a sheet, ready for public.properties (category "mall"). */
export type MallUnitInput = {
  title: string;
  mall_id: string;
  area: string;
  type: string;
  floor: string;
  status: "بيع" | "إيجار";
  size: number;
  price: number;
  description: string | null;
};
export type MallUnitImport = { units: (MallUnitInput & { row: number })[]; errors: { row: number; message: string }[] };

type Field = "mall" | "title" | "type" | "floor" | "status" | "size" | "price" | "description";
const HEADERS: Record<Field, string[]> = {
  mall: ["المول", "اسم المول", "mall"],
  title: ["اسم الوحدة", "رقم الوحدة", "العنوان", "title", "unit"],
  type: ["نوع الوحدة", "النوع", "type"],
  floor: ["الدور", "floor"],
  status: ["الغرض", "بيع أو إيجار", "purpose", "status"],
  size: ["المساحة", "المساحة م2", "المساحة (م²)", "size", "m2"],
  price: ["السعر", "السعر (ج.م)", "price"],
  description: ["الوصف", "التفاصيل", "description"],
};
export const MALL_UNIT_HEADERS = ["المول", "اسم الوحدة", "نوع الوحدة", "الدور", "الغرض", "المساحة", "السعر", "الوصف"];
export const MAX_MALL_UNITS = 500;

const key = (v: unknown) => String(v ?? "").trim().toLowerCase();
const norm = (v: unknown) => String(v ?? "").replace(ARABIC_DIGITS, latinDigit).replace(/\s+/g, " ").trim();
/** Arabic letters vary in spelling (أ/ا, ة/ه, ى/ي): compare loosely, store the canonical value. */
const loose = (s: string) => key(s).replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/^ال/, "");
const num = (v: unknown) => {
  const s = norm(v).replace(/[,،٬\s]/g, "").replace(/ج\.?م|جنيه|م2|م²|متر/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : ("bad" as const);
};

/** Short words people type for a unit type → the site's canonical type. */
const TYPE_ALIASES: Record<string, string> = { "محل": "محل تجاري", "مكتب": "مكتب إداري", "مطعم": "مطعم / كافيه", "كافيه": "مطعم / كافيه", "كافيه / مطعم": "مطعم / كافيه", "معمل": "معمل تحاليل", "اشعه": "مركز أشعة", "علاج طبيعي": "مركز علاج طبيعي", "شقه": "شقة سكنية", "سكني": "شقة سكنية" };
/** Floor words and numbers → one of MALL_FLOORS. */
function pickFloor(v: string) {
  const s = loose(v).replace(/^دور /, "").replace(/^الدور /, "");
  if (!s) return null;
  const byNum = ["0", "1", "2", "3", "4"].indexOf(s);
  if (byNum >= 0) return MALL_FLOORS[byNum]!;
  if (/^([5-9]|[1-9][0-9])$/.test(s) || /خامس|سادس|سابع|ثامن|تاسع|عاشر|اعلي/.test(s)) return MALL_FLOORS[5]!;
  if (/ارض|بدروم/.test(s)) return MALL_FLOORS[0]!;
  if (/اول/.test(s)) return MALL_FLOORS[1]!;
  if (/تاني|ثاني/.test(s)) return MALL_FLOORS[2]!;
  if (/تالت|ثالث/.test(s)) return MALL_FLOORS[3]!;
  if (/رابع/.test(s)) return MALL_FLOORS[4]!;
  return null;
}

/** Rows (first row = headers) → valid units + errors with 1-based sheet row numbers. Malls are matched by name. */
export function parseMallUnitsSheet(rows: unknown[][], malls: { id: string; name: string }[]): MallUnitImport {
  const errors: MallUnitImport["errors"] = [];
  const units: MallUnitImport["units"] = [];
  const header = (rows[0] ?? []).map(key);
  const col = {} as Record<Field, number>;
  for (const f of Object.keys(HEADERS) as Field[]) col[f] = header.findIndex((h) => HEADERS[f].some((a) => a.toLowerCase() === h));
  const missing = (["mall", "type", "floor", "status", "size", "price"] as Field[]).filter((f) => col[f] < 0);
  if (missing.length) return { units, errors: [{ row: 1, message: `أعمدة ناقصة: ${missing.map((f) => HEADERS[f][0]).join("، ")}` }] };

  rows.slice(1, MAX_MALL_UNITS + 1).forEach((r, i) => {
    const row = i + 2;
    const cell = (f: Field) => (col[f] >= 0 ? r[col[f]] : "");
    if ((r ?? []).every((c) => norm(c) === "")) return;
    const problems: string[] = [];
    const mallText = norm(cell("mall"));
    const mall = malls.find((m) => loose(m.name) === loose(mallText));
    if (!mall) problems.push(`المول «${mallText}» مش موجود (${malls.map((m) => m.name).join(" / ")})`);
    const typeText = norm(cell("type"));
    const type = MALL_UNIT_TYPES.find((t) => loose(t) === loose(typeText)) ?? TYPE_ALIASES[loose(typeText)];
    if (!type) problems.push(`نوع الوحدة «${typeText}» مش معروف`);
    const floor = pickFloor(norm(cell("floor")));
    if (!floor) problems.push(`الدور «${norm(cell("floor"))}» مش مفهوم (أرضي / أول / تاني / تالت / رابع / خامس أو أعلى)`);
    const st = loose(norm(cell("status")));
    const status = /بيع|sale|sell/.test(st) ? "بيع" : /ايجار|rent/.test(st) ? "إيجار" : null;
    if (!status) problems.push(`الغرض «${norm(cell("status"))}» لازم بيع أو إيجار`);
    const size = num(cell("size")), price = num(cell("price"));
    if (size === null || size === "bad" || size <= 0) problems.push("المساحة لازم رقم أكبر من صفر");
    if (price === null || price === "bad" || price <= 0) problems.push("السعر لازم رقم أكبر من صفر");
    if (problems.length) { errors.push({ row, message: problems.join(" · ") }); return; }
    const title = (norm(cell("title")) || `${type} — الدور ${floor} — ${mall!.name}`).slice(0, 150);
    units.push({ row, title, mall_id: mall!.id, area: mall!.name, type: type!, floor: floor!, status: status!, size: size as number, price: price as number, description: norm(cell("description")).slice(0, 2000) || null });
  });
  return { units, errors };
}
