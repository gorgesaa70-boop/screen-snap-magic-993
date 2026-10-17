import { ARABIC_DIGITS, latinDigit } from "@/lib/digits";
// «طابق الأعمدة»: any Excel / CSV layout → the canonical rows each importer's parser already understands.
// Pure functions — no I/O.

/** One field an importer needs. `key` is the column title its parser reads (its first accepted alias). */
export type MapField = {
  key: string;
  label: string;
  /** Other titles people use for this column (matched loosely); the key itself is always tried first. */
  aliases?: string[];
  required?: boolean;
  /** Fields sharing a group: at least one of them is required (e.g. total price or price per m²). */
  group?: string;
  /** Instead of a column, one value for every row: a list to pick from, or free text. */
  constant?: string[] | "text";
};

/** Column index in the file, or a fixed value for every row. */
export type FieldSource = { col: number } | { value: string } | null;
export type Mapping = Record<string, FieldSource>;

const text = (v: unknown) => String(v ?? "").replace(/[‏‎]/g, "").replace(/\s+/g, " ").trim();
/** Arabic spelling variants (أ/ا، ة/ه، ى/ي، ال) and spacing don't matter when matching titles. */
export const looseKey = (v: unknown) =>
  text(v).toLowerCase().replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/[()\[\]:.،,_-]/g, " ").replace(/\s+/g, " ").trim()
    .split(" ").map((w) => w.replace(/^ال/, "")).join(" ");

/** The header row: the first of the top 15 rows with at least two text (non-number) cells. */
export function findHeaderRow(rows: unknown[][]): number {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const cells = (rows[i] ?? []).map(text).filter(Boolean);
    if (cells.filter((c) => !/^[\d.,\s%]+$/.test(c)).length >= 2) return i;
  }
  return 0;
}

/** Best guess per field from the titles: exact (loose) match first, then a title containing an alias. */
export function guessMapping(headers: unknown[], fields: MapField[]): Mapping {
  const h = headers.map(looseKey);
  const used = new Set<number>();
  const out: Mapping = {};
  const names = (f: MapField) => [f.key, ...(f.aliases ?? [])].map(looseKey).filter(Boolean);
  for (const f of fields) {
    const i = h.findIndex((x, j) => !used.has(j) && x && names(f).includes(x));
    out[f.key] = i >= 0 ? { col: i } : null;
    if (i >= 0) used.add(i);
  }
  for (const f of fields) {
    if (out[f.key]) continue;
    const i = h.findIndex((x, j) => !used.has(j) && x && names(f).some((n) => n.length >= 3 && (x.includes(n) || (x.length >= 3 && n.includes(x)))));
    if (i >= 0) { out[f.key] = { col: i }; used.add(i); }
  }
  return out;
}

/** Which required fields (or required groups) still have no column and no fixed value. */
export function missingFields(mapping: Mapping, fields: MapField[]): string[] {
  const has = (f: MapField) => { const s = mapping[f.key]; return !!s && ("col" in s ? s.col >= 0 : s.value.trim() !== ""); };
  const out = fields.filter((f) => f.required && !has(f)).map((f) => f.label);
  const groups = new Map<string, MapField[]>();
  for (const f of fields) if (f.group) groups.set(f.group, [...(groups.get(f.group) ?? []), f]);
  for (const g of groups.values()) if (!g.some(has)) out.push(g.map((f) => f.label).join(" أو "));
  return out;
}

/**
 * Canonical rows for the parser: a header row of field keys, then one row per data row. Columns picked in `extras`
 * are appended to the `notesKey` field as «title: value» lines, so nothing in the file is lost.
 */
export function applyMapping(rows: unknown[][], headerRow: number, mapping: Mapping, fields: MapField[], extras: number[] = [], notesKey?: string): unknown[][] {
  const headers = rows[headerRow] ?? [];
  const keys = fields.filter((f) => mapping[f.key]).map((f) => f.key);
  if (notesKey && extras.length && !keys.includes(notesKey)) keys.push(notesKey);
  const out: unknown[][] = [keys];
  for (const r of rows.slice(headerRow + 1)) {
    const row = r ?? [];
    if (row.every((c) => text(c) === "")) { out.push([]); continue; }
    out.push(keys.map((k) => {
      const s = mapping[k];
      let v: unknown = !s ? "" : "col" in s ? row[s.col] : s.value;
      if (k === notesKey && extras.length) {
        const more = extras.map((c) => (text(row[c]) ? `${text(headers[c]) || "عمود"}: ${text(row[c])}` : "")).filter(Boolean);
        v = [text(v), ...more].filter(Boolean).join("\n");
      }
      return v;
    }));
  }
  return out;
}

/** Remembered per importer and per file layout (same titles in the same order). */
export const mappingStorageKey = (importer: string, headers: unknown[]) => `va-sheet-map:${importer}:${headers.map(looseKey).join("|")}`;

/**
 * Numbers as people type them in price lists: Arabic digits, thousands separators and units
 * («145,000 ج.م»، «33م»، «٣٥ متر»). Returns null for an empty cell, "bad" when it isn't a number.
 */
export function cleanNumber(v: unknown): number | null | "bad" {
  if (typeof v === "number") return Number.isFinite(v) ? v : "bad";
  const s = text(v).replace(ARABIC_DIGITS, latinDigit).replace(/٫/g, ".").replace(/[,،٬\s]/g, "").replace(/ج\.?م|جنيه|egp|م2|م²|متر|m2|م$/gi, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : "bad";
}

/** «35م 85,000»: the size (number before «م») and a stray second number that slipped into the cell. */
export function sizeCell(v: unknown): { size: number | null | "bad"; extra: number | null } {
  const s = text(v).replace(ARABIC_DIGITS, latinDigit);
  const m = s.match(/^(\d+(?:\.\d+)?)\s*(?:م2|م²|م|متر)\s*([\d,،٬]+)?$/);
  if (!m) return { size: cleanNumber(v), extra: null };
  const extra = m[2] ? Number(m[2].replace(/[,،٬]/g, "")) : null;
  return { size: Number(m[1]), extra: extra && Number.isFinite(extra) ? extra : null };
}

/** Builds an importer's mapper fields from its accepted titles (key = first title, the rest are aliases). */
export function mapFields<K extends string>(headers: Record<K, string[]>, list: [K, string, Partial<MapField>?][]): MapField[] {
  return list.map(([k, label, extra]) => ({ key: headers[k][0]!, label, aliases: headers[k].slice(1), ...extra }));
}
