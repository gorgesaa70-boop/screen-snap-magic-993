import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Columns3 } from "lucide-react";
import { inputCls, btnPrimary } from "@/components/site/ui";
import { parseCsv } from "@/lib/units-import";
import { applyMapping, findHeaderRow, guessMapping, mappingStorageKey, missingFields, type FieldSource, type MapField, type Mapping } from "@/lib/sheet-mapping";

/** Reads an .xlsx or .csv file into rows (first sheet). Throws on anything else. */
export async function readSheetFile(file: File): Promise<unknown[][]> {
  if (file.size > 5 * 1024 * 1024) throw new Error("الملف أكبر من 5 ميجا");
  if (/\.csv$/i.test(file.name)) return parseCsv(await file.text());
  if (/\.xlsx$/i.test(file.name)) { const { readSheet } = await import("read-excel-file/browser"); return (await readSheet(file)) as unknown[][]; }
  throw new Error("ارفع ملف Excel (.xlsx) أو CSV");
}

/** Sheet row numbers in results are counted from the header; this moves them to the real rows of the file. */
export function shiftRows<T extends { row: number }>(list: T[], offset: number): T[] {
  if (!offset) return list;
  // Messages can point at another row too («متكرر (صف 4)»).
  const fix = (s: unknown) => (typeof s === "string" ? s.replace(/صف (\d+)/g, (_, n: string) => `صف ${Number(n) + offset}`) : s);
  return list.map((x) => {
    const y = { ...x, row: x.row + offset } as T & { message?: unknown; reason?: unknown };
    if ("message" in y) y.message = fix(y.message);
    if ("reason" in y) y.reason = fix(y.reason);
    return y;
  });
}

const text = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();

/**
 * «طابق الأعمدة»: works with any file layout. Each field gets a column of the file (guessed from the titles) or one
 * fixed value for all rows; unused columns can be kept in the notes. The choice is remembered for the same layout.
 */
export function ColumnMapper({ importer, file, rows, fields, notesKey, intro, onApply, onCancel }: {
  importer: string; file: string; rows: unknown[][]; fields: MapField[]; notesKey?: string; intro?: string;
  onApply: (canonical: unknown[][], rowOffset: number) => void; onCancel: () => void;
}) {
  const [headerRow, setHeaderRow] = useState(() => findHeaderRow(rows));
  const headers = rows[headerRow] ?? [];
  const width = Math.max(...rows.slice(headerRow, headerRow + 50).map((r) => (r ?? []).length), 0);
  const colName = (i: number) => text(headers[i]) || `عمود ${i + 1}`;
  const sample = (i: number) => rows.slice(headerRow + 1).map((r) => text((r ?? [])[i])).find(Boolean) ?? "";
  const stored = useMemo(() => {
    try { return JSON.parse(localStorage.getItem(mappingStorageKey(importer, headers)) ?? "null") as { mapping: Mapping; extras: number[] } | null; } catch { return null; }
  }, [importer, headers]);
  const [mapping, setMapping] = useState<Mapping>(() => stored?.mapping ?? guessMapping(headers, fields));
  const [extras, setExtras] = useState<number[]>(() => stored?.extras ?? []);
  const changeHeader = (n: number) => { setHeaderRow(n); setMapping(guessMapping(rows[n] ?? [], fields)); setExtras([]); };

  const usedCols = new Set(Object.values(mapping).flatMap((s) => (s && "col" in s ? [s.col] : [])));
  const leftover = Array.from({ length: width }, (_, i) => i).filter((i) => !usedCols.has(i) && sample(i));
  const missing = missingFields(mapping, fields);
  const dataRows = rows.slice(headerRow + 1).filter((r) => (r ?? []).some((c) => text(c))).length;

  const set = (key: string, src: FieldSource) => setMapping((m) => ({ ...m, [key]: src }));
  function apply() {
    if (missing.length) { toast.error(`لسه ناقص: ${missing.join("، ")}`); return; }
    const keep = extras.filter((i) => !usedCols.has(i));
    try { localStorage.setItem(mappingStorageKey(importer, headers), JSON.stringify({ mapping, extras: keep })); } catch { /* private mode: not remembered */ }
    onApply(applyMapping(rows, headerRow, mapping, fields, keep, notesKey), headerRow);
  }

  return (
    <div className="space-y-3 border-t pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <Columns3 className="size-4 text-primary" />
        <p className="text-sm font-bold text-primary">طابق الأعمدة — {file} ({dataRows} صف)</p>
      </div>
      <p className="text-xs text-muted-foreground">{intro ?? "اختار لكل خانة العمود اللي يقابلها في ملفك، أو قيمة واحدة لكل الصفوف. الموقع خمّن من أسماء الأعمدة — راجعها. الاختيار بيتحفظ للملفات اللي بنفس الشكل."}</p>
      <label className="flex flex-wrap items-center gap-2 text-xs font-bold text-primary">
        صف العناوين في الملف:
        <select className={`${inputCls} w-auto`} value={headerRow} onChange={(e) => changeHeader(Number(e.target.value))}>
          {rows.slice(0, 15).map((r, i) => <option key={i} value={i}>صف {i + 1}: {(r ?? []).map(text).filter(Boolean).slice(0, 4).join(" · ").slice(0, 60) || "فاضي"}</option>)}
        </select>
      </label>
      <div className="grid gap-2 sm:grid-cols-2">
        {fields.map((f) => {
          const s = mapping[f.key] ?? null;
          const val = !s ? "" : "col" in s ? `c${s.col}` : "fixed";
          return (
            <div key={f.key} className="rounded-xl border p-2.5">
              <p className="mb-1 text-xs font-bold text-primary">{f.label}{f.required ? " *" : f.group ? " *" : ""}</p>
              <select className={inputCls} value={val} onChange={(e) => {
                const v = e.target.value;
                set(f.key, v === "" ? null : v === "fixed" ? { value: Array.isArray(f.constant) ? f.constant[0] ?? "" : "" } : { col: Number(v.slice(1)) });
              }}>
                <option value="">— مش في الملف —</option>
                {Array.from({ length: width }, (_, i) => i).map((i) => <option key={i} value={`c${i}`}>{colName(i)}{sample(i) ? ` (مثال: ${sample(i).slice(0, 25)})` : ""}</option>)}
                {f.constant && <option value="fixed">قيمة واحدة لكل الصفوف…</option>}
              </select>
              {s && "value" in s && (Array.isArray(f.constant)
                ? <select className={`${inputCls} mt-1.5`} value={s.value} onChange={(e) => set(f.key, { value: e.target.value })}>{f.constant.map((o) => <option key={o}>{o}</option>)}</select>
                : <input className={`${inputCls} mt-1.5`} value={s.value} onChange={(e) => set(f.key, { value: e.target.value })} placeholder="اكتب القيمة" />)}
            </div>
          );
        })}
      </div>
      {notesKey && leftover.length > 0 && (
        <div className="rounded-xl bg-secondary p-3">
          <p className="mb-1.5 text-xs font-bold text-primary">أعمدة تانية في الملف — علّم اللي عايزه يتكتب في {fields.find((f) => f.key === notesKey)?.label ?? "الملاحظات"}:</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {leftover.map((i) => (
              <label key={i} className="flex items-center gap-1.5 text-xs">
                <input type="checkbox" className="size-4" checked={extras.includes(i)} onChange={(e) => setExtras((x) => (e.target.checked ? [...x, i] : x.filter((y) => y !== i)))} />
                {colName(i)}
              </label>
            ))}
          </div>
        </div>
      )}
      {missing.length > 0 && <p className="text-xs font-bold text-destructive">لسه ناقص: {missing.join("، ")}</p>}
      <div className="flex flex-wrap gap-2">
        <button onClick={apply} disabled={missing.length > 0} className={btnPrimary}>اقرا الملف</button>
        <button onClick={onCancel} className="h-11 px-4 text-sm font-bold text-muted-foreground hover:text-primary">إلغاء</button>
      </div>
    </div>
  );
}
