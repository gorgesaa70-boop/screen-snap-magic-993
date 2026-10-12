import { ARABIC_DIGITS, latinDigit } from "@/lib/digits";
import { CITY_NAMES, areasOf } from "@/components/site/data";
import { AMENITIES } from "@/components/site/projects";

/** One compound / project from a sheet, ready for public.projects (developer_id added by the caller). */
export type ProjectInput = {
  name: string;
  city: string;
  area: string;
  address: string | null;
  delivery_date: string | null;
  payment_plans: string | null;
  amenities: string[];
  description: string | null;
};
export type ProjectImport = { projects: (ProjectInput & { row: number })[]; errors: { row: number; message: string }[] };

type Field = keyof ProjectInput;
const HEADERS: Record<Field, string[]> = {
  name: ["اسم الكمبوند", "اسم المشروع", "الاسم", "name", "project"],
  city: ["المدينة", "city"],
  area: ["المنطقة", "الحي", "area", "district"],
  address: ["العنوان", "address"],
  delivery_date: ["موعد التسليم", "التسليم", "delivery"],
  payment_plans: ["أنظمة السداد", "انظمة السداد", "التقسيط", "payment plans"],
  amenities: ["المميزات", "الخدمات", "amenities"],
  description: ["الوصف", "description"],
};
export const PROJECT_HEADERS = ["اسم الكمبوند", "المدينة", "المنطقة", "العنوان", "موعد التسليم", "أنظمة السداد", "المميزات", "الوصف"];
export const MAX_PROJECTS = 200;

const key = (v: unknown) => String(v ?? "").trim().toLowerCase();
const norm = (v: unknown) => String(v ?? "").replace(ARABIC_DIGITS, latinDigit).replace(/[ \t]+/g, " ").trim();
const loose = (s: string) => key(s).replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي");
const pick = (v: string, list: string[]) => list.find((x) => loose(x) === loose(v));

/**
 * Rows (first row = headers) → valid compounds + errors with 1-based sheet row numbers.
 * Names already used by this developer (existingNames) or repeated in the file are refused.
 * Amenities: separated by «،» «,» or new lines; each must be one of the site's amenities.
 */
export function parseProjectsSheet(rows: unknown[][], existingNames: Iterable<string> = []): ProjectImport {
  const errors: ProjectImport["errors"] = [];
  const projects: ProjectImport["projects"] = [];
  const header = (rows[0] ?? []).map(key);
  const col = {} as Record<Field, number>;
  for (const f of Object.keys(HEADERS) as Field[]) col[f] = header.findIndex((h) => HEADERS[f].some((a) => a.toLowerCase() === h));
  const missing = (["name", "city"] as Field[]).filter((f) => col[f] < 0);
  if (missing.length) return { projects, errors: [{ row: 1, message: `أعمدة ناقصة: ${missing.map((f) => HEADERS[f][0]).join("، ")}` }] };
  const seen = new Set([...existingNames].map(loose));

  rows.slice(1, MAX_PROJECTS + 1).forEach((r, i) => {
    const row = i + 2;
    const cell = (f: Field) => (col[f] >= 0 ? r[col[f]] : "");
    if ((r ?? []).every((c) => norm(c) === "")) return;
    const problems: string[] = [];
    const name = norm(cell("name")).slice(0, 150);
    if (name.length < 2) problems.push("اسم الكمبوند ناقص");
    else if (seen.has(loose(name))) problems.push(`الكمبوند «${name}» موجود قبل كده أو متكرر في الملف`);
    const city = pick(norm(cell("city")), CITY_NAMES);
    if (!city) problems.push(`المدينة «${norm(cell("city"))}» مش من المدن المتاحة (${CITY_NAMES.join(" / ")})`);
    let area = city ?? "";
    if (city && areasOf(city)[0] !== city) {
      const a = pick(norm(cell("area")), areasOf(city));
      if (!a) problems.push(`المنطقة «${norm(cell("area"))}» مش من مناطق ${city}`);
      else area = a;
    }
    const amenityWords = norm(cell("amenities")).split(/[،,\n؛;]+/).map((s) => s.trim()).filter(Boolean);
    const amenities: string[] = [];
    for (const w of amenityWords) {
      const a = pick(w, AMENITIES);
      if (a) { if (!amenities.includes(a)) amenities.push(a); } else problems.push(`ميزة «${w}» مش من القايمة`);
    }
    if (problems.length) { errors.push({ row, message: problems.join(" · ") }); return; }
    seen.add(loose(name));
    projects.push({
      row, name, city: city!, area,
      address: norm(cell("address")).slice(0, 300) || null,
      delivery_date: norm(cell("delivery_date")).slice(0, 100) || null,
      payment_plans: String(cell("payment_plans") ?? "").trim().slice(0, 2000) || null,
      amenities,
      description: String(cell("description") ?? "").trim().slice(0, 5000) || null,
    });
  });
  return { projects, errors };
}
