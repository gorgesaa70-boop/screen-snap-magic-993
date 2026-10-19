import { useState } from "react";
import { toast } from "sonner";
import { FileSpreadsheet, Download } from "lucide-react";
import { dbx } from "@/lib/dbx";
import { MAX_ROWS, parseUnitsSheet, unitFields, type ImportResult, type UnitInput } from "@/lib/units-import";
import { ColumnMapper, readSheetFile, shiftRows } from "./ColumnMapper";
import { UNIT_STATUS } from "@/components/site/projects";
import { formatPrice } from "@/components/site/data";
import { btnOutline, btnPrimary } from "@/components/site/ui";

/** Import units from Excel (.xlsx) or CSV: validate everything first, show errors by row, then insert the valid rows.
 * Works for a project's units or a compound's units (pass one of the two ids). With `onReady` (the add / edit compound
 * form) nothing is saved here: the valid units go back to the form, which adds them when the compound is saved. */
export function UnitsImport({ projectId, compoundId, existingCodes, onDone, onReady }: {
  projectId?: string; compoundId?: string; existingCodes: string[]; onDone?: () => void; onReady?: (units: UnitInput[] | null) => void;
}) {
  const [result, setResult] = useState<(ImportResult & { file: string }) | null>(null);
  // Any file layout goes through «طابق الأعمدة» first.
  const [raw, setRaw] = useState<{ rows: unknown[][]; file: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const compound = !!compoundId || !!onReady;
  const opts = { compound };

  // Excel template with drop-downs (type, status, and finishing for compounds), plus a guide sheet.
  const templateFile = compound ? "value-aqar-compound-units-template.xlsx" : "value-aqar-project-units-template.xlsx";
  const template = () => { const a = document.createElement("a"); a.href = `/templates/${templateFile}`; a.download = templateFile; a.click(); };
  const show = (r: (ImportResult & { file: string }) | null) => { setResult(r); onReady?.(r ? r.units.map(({ row: _row, ...u }) => u) : null); };
  const cancel = () => { show(null); setRaw(null); };
  async function read(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      setRaw({ rows: await readSheetFile(file), file: file.name });
      show(null);
    } catch (err) {
      toast.error(err instanceof Error && /ميجا|ارفع/.test(err.message) ? err.message : "تعذّر قراءة الملف — اتأكد إنه Excel (.xlsx) أو CSV سليم");
    } finally { setBusy(false); }
  }
  async function save() {
    if (!result?.units.length) return;
    setBusy(true);
    const units = result.units.map(({ row: _row, ...u }) => u);
    for (let i = 0; i < units.length; i += 200) {
      const chunk = units.slice(i, i + 200);
      const { error } = compoundId
        ? await dbx.from("compound_units").insert(chunk.map((u) => ({ ...u, compound_id: compoundId })))
        : await dbx.from("project_units").insert(chunk.map(({ building: _b, finishing: _f, ...u }) => ({ ...u, project_id: projectId! })));
      if (error) {
        setBusy(false);
        toast.error(error.code === "23505" ? (compoundId ? "فيه كود اتضاف من شوية لنفس الكمبوند — اقرا الملف تاني" : "فيه كود اتضاف من شوية لنفس المشروع — اقرا الملف تاني") : error.message);
        if (i > 0) { toast.info(`اتضاف ${i} وحدة قبل الخطأ`); onDone?.(); }
        return;
      }
    }
    setBusy(false);
    toast.success(`اتضافت ${units.length} وحدة`);
    setResult(null); setRaw(null); onDone?.();
  }

  return (
    <div className="space-y-3 rounded-2xl border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className={`${btnPrimary} cursor-pointer`}><FileSpreadsheet className="size-4" />{busy ? "..." : "اختار ملف Excel أو CSV"}<input type="file" accept=".xlsx,.csv" className="hidden" disabled={busy} onChange={read} /></label>
        <button type="button" onClick={template} className={btnOutline}><Download className="size-4" />{compound ? "تنزيل نموذج وحدات الكمبوند" : "تنزيل نموذج الأعمدة"}</button>
      </div>
      <p className="text-xs text-muted-foreground">
        ارفع ملف الوحدات بأي شكل وطابق الأعمدة — النوع والمساحة إجباريين (النوع ممكن قيمة واحدة لكل الصفوف).{compound ? " العمارة بتجمّع الوحدات في خريطة الوحدات." : ""} السعر إجمالي أو سعر متر. الحالة: متاحة / محجوزة / مباعة / غير متاحة (لو فاضية = متاحة). لحد {MAX_ROWS} صف. الأكواد المتكررة أو الموجودة بتترفض.
      </p>
      {raw && !result && (
        <ColumnMapper importer={compound ? "compound-units" : "units"} file={raw.file} rows={raw.rows} fields={unitFields(opts)} notesKey="ملاحظات" onCancel={() => setRaw(null)}
          onApply={(rows, offset) => { const r = parseUnitsSheet(rows, existingCodes, opts); show({ units: shiftRows(r.units, offset), errors: shiftRows(r.errors, offset), file: raw.file }); }} />
      )}
      {result && (
        <div className="space-y-3 border-t pt-3">
          <button type="button" onClick={() => show(null)} className="text-xs font-bold text-primary underline">تعديل مطابقة الأعمدة</button>
          <p className="text-sm font-bold text-primary">{result.file}: {result.units.length} وحدة سليمة{result.errors.length ? ` · ${result.errors.length} صف فيه أخطاء` : ""}</p>
          {result.errors.length > 0 && (
            <ul className="max-h-48 space-y-1 overflow-y-auto rounded-xl bg-destructive/5 p-3 text-xs text-destructive">
              {result.errors.map((er) => <li key={er.row}><b>صف {er.row}:</b> {er.message}</li>)}
            </ul>
          )}
          {result.units.length > 0 && (
            <div className="max-h-64 overflow-auto rounded-xl border">
              <table className="w-full min-w-[560px] text-xs">
                <thead className="sticky top-0 bg-secondary text-primary"><tr>{["صف", ...(compound ? ["العمارة"] : []), "الكود", "النوع", "المساحة", "الغرف", "الدور", ...(compound ? ["التشطيب"] : []), "السعر", "الحالة"].map((h) => <th key={h} className="p-2 text-start">{h}</th>)}</tr></thead>
                <tbody>
                  {result.units.slice(0, 200).map((u) => (
                    <tr key={u.row} className="border-t"><td className="p-2">{u.row}</td>{compound && <td className="p-2">{u.building ?? "—"}</td>}<td className="p-2" dir="ltr">{u.code ?? "—"}</td><td className="p-2">{u.unit_type}</td><td className="p-2">{formatPrice(u.size)}</td><td className="p-2">{u.rooms ?? "—"}</td><td className="p-2">{u.floor ?? "—"}</td>{compound && <td className="p-2">{u.finishing ?? "—"}</td>}<td className="p-2">{u.price != null ? formatPrice(u.price) : "—"}</td><td className="p-2">{UNIT_STATUS[u.status]?.label}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {onReady
              ? result.units.length > 0 && <p className="rounded-xl bg-teal-soft px-3 py-2 text-xs font-bold text-primary">الـ {result.units.length} وحدة هيتضافوا مع حفظ الكمبوند.</p>
              : <button type="button" disabled={busy || !result.units.length} onClick={save} className={btnPrimary}>{busy ? "..." : `استيراد ${result.units.length} وحدة`}</button>}
            <button type="button" onClick={cancel} className="h-11 px-4 text-sm font-bold text-muted-foreground hover:text-primary">{onReady ? "شيل الملف" : "إلغاء"}</button>
          </div>
          {result.errors.length > 0 && result.units.length > 0 && <p className="text-xs text-muted-foreground">الصفوف اللي فيها أخطاء مش هتتضاف — صلّحها وارفعها في ملف تاني.</p>}
        </div>
      )}
    </div>
  );
}
