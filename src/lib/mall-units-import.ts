import { ARABIC_DIGITS, latinDigit } from "@/lib/digits";
import { MALL_FLOORS, MALL_UNIT_TYPES } from "@/components/site/malls";
import type { MapField } from "@/lib/sheet-mapping";

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
  // Installments (sale only), read from a developer sheet's «انظمه السداد» text.
  payment_method?: "installment";
  down_payment?: number;
  installment_years?: number;
  monthly_installment?: number;
  installment_note?: string;
};
export type MallUnitImport = {
  units: (MallUnitInput & { row: number; note?: string })[];
  errors: { row: number; message: string }[];
};
/** Used for rows (or whole sheets) without a type / floor / purpose column, e.g. a developer's price list. */
export type MallUnitDefaults = { type: string; floor: string; status: "بيع" | "إيجار" };

type Field = "mall" | "title" | "type" | "floor" | "status" | "size" | "price" | "ppm" | "description" | "payment" | "delivery" | "address" | "district";
const HEADERS: Record<Field, string[]> = {
  mall: ["المول", "اسم المول", "اسم المشروع", "المشروع", "mall"],
  title: ["اسم الوحدة", "رقم الوحدة", "كود الوحدة", "title", "unit"],
  type: ["نوع الوحدة", "النوع", "type"],
  floor: ["الدور", "floor"],
  status: ["الغرض", "بيع أو إيجار", "purpose", "status"],
  size: ["المساحة", "المساحات", "المساحة م2", "المساحة (م²)", "size", "m2"],
  price: ["السعر", "السعر (ج.م)", "السعر الإجمالي", "price"],
  ppm: ["سعر المتر", "سعر المتر (ج.م)", "price per m2"],
  description: ["الوصف", "التفاصيل", "description"],
  payment: ["انظمه السداد", "أنظمة السداد", "انظمة السداد", "نظام السداد", "طريقة السداد"],
  delivery: ["الاستلام", "موعد الاستلام", "موعد التسليم", "التسليم"],
  address: ["العنوان"],
  district: ["المنطقة", "الحي"],
};
/** Fields for «طابق الأعمدة» (any file layout); the mall, type, floor and purpose can be one value for all rows. */
export function mallUnitFields(mallNames: string[]): MapField[] {
  const f = (k: Field, label: string, extra: Partial<MapField> = {}): MapField => ({ key: HEADERS[k][0]!, label, aliases: HEADERS[k].slice(1), ...extra });
  return [
    f("mall", "المول", { required: true, constant: mallNames }),
    f("title", "اسم / رقم الوحدة"),
    f("type", "نوع الوحدة", { required: true, constant: MALL_UNIT_TYPES }),
    f("floor", "الدور", { required: true, constant: MALL_FLOORS }),
    f("status", "الغرض (بيع / إيجار)", { required: true, constant: ["بيع", "إيجار"] }),
    f("size", "المساحة", { required: true }),
    f("price", "السعر الإجمالي", { group: "price" }),
    f("ppm", "سعر المتر", { group: "price" }),
    f("payment", "نظام السداد (بيتحسب منه المقدم والسنين)"),
    f("delivery", "الاستلام"),
    f("address", "العنوان"),
    f("district", "المنطقة"),
    f("description", "الوصف"),
  ];
}
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
/**
 * Size cells from developer sheets: "33م", or "35م 85,000" where a second number slipped into the cell.
 * Returns the size (the number before «م») and that extra number, if any.
 */
function sizeCell(v: unknown): { size: number | null | "bad"; extra: number | null } {
  const s = norm(v);
  const m = s.match(/^(\d+(?:\.\d+)?)\s*(?:م2|م²|م|متر)\s*([\d,،٬]+)?$/);
  if (!m) return { size: num(v), extra: null };
  const extra = m[2] ? Number(m[2].replace(/[,،٬]/g, "")) : null;
  return { size: Number(m[1]), extra: extra && Number.isFinite(extra) ? extra : null };
}
/** "قسط علي 3 سنين 15% مقدم" → years and down-payment percent (null when the text doesn't say). */
export function parsePaymentText(v: unknown): { years: number | null; pct: number | null } {
  const s = norm(v);
  const years = s.match(/(\d+)\s*(?:سنين|سنوات|سنه|سنة|سنا?ت)/);
  const pct = s.match(/(\d+(?:\.\d+)?)\s*%/);
  return { years: years ? Number(years[1]) : null, pct: pct ? Number(pct[1]) : null };
}

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

/**
 * Rows (header row first; blank rows before the data are fine) → valid units + errors with 1-based sheet row numbers.
 * Malls are matched by name. Two layouts: the site template (total price per unit) and a developer price list
 * (اسم المشروع / المساحات / سعر المتر / انظمه السداد / الاستلام), where price = size × price per m² and
 * type / floor / purpose come from `defaults`.
 */
export function parseMallUnitsSheet(rows: unknown[][], malls: { id: string; name: string }[], defaults?: MallUnitDefaults): MallUnitImport {
  const errors: MallUnitImport["errors"] = [];
  const units: MallUnitImport["units"] = [];
  const header = (rows[0] ?? []).map(key);
  const find = (aliases: string[]) => header.findIndex((h) => aliases.some((a) => a.toLowerCase() === h));
  const col = {} as Record<Field, number>;
  for (const f of Object.keys(HEADERS) as Field[]) col[f] = find(HEADERS[f]);
  // Developer price lists (with «سعر المتر») repeat the same unit, so generated names carry the size.
  const developer = col.ppm >= 0;
  const required: Field[] = ["mall", "size", ...(defaults ? [] : (["type", "floor", "status"] as Field[]))];
  const missing = required.filter((f) => col[f] < 0);
  if (col.price < 0 && col.ppm < 0) missing.push("price");
  if (missing.length) return { units, errors: [{ row: 1, message: `أعمدة ناقصة: ${missing.map((f) => HEADERS[f][0]).join("، ")}` }] };

  rows.slice(1, MAX_MALL_UNITS + 1).forEach((r, i) => {
    const row = i + 2;
    const cell = (f: Field) => (col[f] >= 0 ? r[col[f]] : "");
    if ((r ?? []).every((c) => norm(c) === "")) return;
    const problems: string[] = [];
    const notes: string[] = [];
    const mallText = norm(cell("mall"));
    const mall = malls.find((m) => loose(m.name) === loose(mallText));
    if (!mall) problems.push(`المول «${mallText}» مش موجود (${malls.map((m) => m.name).join(" / ")})`);
    const typeText = norm(cell("type"));
    const type = (typeText ? MALL_UNIT_TYPES.find((t) => loose(t) === loose(typeText)) ?? TYPE_ALIASES[loose(typeText)] : defaults?.type);
    if (!type) problems.push(`نوع الوحدة «${typeText}» مش معروف`);
    const floorText = norm(cell("floor"));
    const floor = floorText ? pickFloor(floorText) : defaults?.floor ?? null;
    if (!floor) problems.push(`الدور «${floorText}» مش مفهوم (أرضي / أول / تاني / تالت / رابع / خامس أو أعلى)`);
    const st = loose(norm(cell("status")));
    const status = st ? (/بيع|sale|sell/.test(st) ? "بيع" : /ايجار|rent/.test(st) ? "إيجار" : null) : defaults?.status ?? null;
    if (!status) problems.push(`الغرض «${norm(cell("status"))}» لازم بيع أو إيجار`);
    const { size, extra } = sizeCell(cell("size"));
    if (size === null || size === "bad" || size <= 0) problems.push("المساحة لازم رقم أكبر من صفر");
    let price = col.price >= 0 ? num(cell("price")) : null;
    if ((price === null || price === "bad") && col.ppm >= 0) {
      let ppm = num(cell("ppm"));
      // «19م 73,000» with an empty price-per-meter cell: the stray number is taken as the price per meter.
      if ((ppm === null || ppm === "bad") && extra) { ppm = extra; notes.push(`سعر المتر ${extra.toLocaleString("en")} اتاخد من خانة المساحة — راجعه`); }
      else if (extra && ppm !== extra) notes.push(`خانة المساحة فيها رقم زيادة (${extra.toLocaleString("en")}) — اتجاهل، راجعه`);
      price = typeof ppm === "number" && ppm > 0 && typeof size === "number" ? Math.round(size * ppm) : null;
    }
    if (price === null || price === "bad" || price <= 0) problems.push(col.ppm >= 0 ? "سعر المتر لازم رقم أكبر من صفر" : "السعر لازم رقم أكبر من صفر");
    if (problems.length) { errors.push({ row, message: problems.join(" · ") }); return; }

    const total = price as number;
    const payText = norm(cell("payment"));
    const pay = parsePaymentText(payText);
    const installments = status === "بيع" && payText
      ? {
          payment_method: "installment" as const,
          installment_note: payText.slice(0, 500),
          ...(pay.pct != null ? { down_payment: Math.round((total * pay.pct) / 100) } : {}),
          ...(pay.years ? { installment_years: pay.years } : {}),
          ...(pay.years ? { monthly_installment: Math.round((total - (pay.pct != null ? (total * pay.pct) / 100 : 0)) / (pay.years * 12)) } : {}),
        }
      : {};
    const description = [
      norm(cell("description")),
      norm(cell("address")) && `العنوان: ${norm(cell("address"))}${norm(cell("district")) ? ` — ${norm(cell("district"))}` : ""}`,
      norm(cell("delivery")) && `الاستلام: ${norm(cell("delivery"))}`,
      payText && `السداد: ${payText}`,
    ].filter(Boolean).join("\n").slice(0, 2000) || null;
    // Developer lists repeat the same unit type, so their generated names carry the size too.
    const title = (norm(cell("title")) || (developer ? `${type} ${size} م² — الدور ${floor} — ${mall!.name}` : `${type} — الدور ${floor} — ${mall!.name}`)).slice(0, 150);
    units.push({
      row, title, mall_id: mall!.id, area: mall!.name, type: type!, floor: floor!, status: status as "بيع" | "إيجار",
      size: size as number, price: total, description, ...installments, ...(notes.length ? { note: notes.join(" · ") } : {}),
    });
  });
  return { units, errors };
}
