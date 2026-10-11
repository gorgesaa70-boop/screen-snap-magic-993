import { useState } from "react";
import { toast } from "sonner";
import { FileSpreadsheet, Download } from "lucide-react";
import { dbx } from "@/lib/dbx";
import { MAX_ROWS, TEMPLATE_HEADERS, parseCsv, parseUnitsSheet, type ImportResult } from "@/lib/units-import";
import { UNIT_STATUS } from "@/components/site/projects";
import { formatPrice } from "@/components/site/data";
import { btnOutline, btnPrimary } from "@/components/site/ui";

/** Import units from Excel (.xlsx) or CSV: validate everything first, show errors by row, then insert the valid rows. */
export function UnitsImport({ projectId, existingCodes, onDone }: { projectId: string; existingCodes: string[]; onDone: () => void }) {
  const [result, setResult] = useState<(ImportResult & { file: string }) | null>(null);
  const [busy, setBusy] = useState(false);

  function template() {
    const sample = ["A-101", "شقة", "120", "3", "2", "الأول", "1500000", "متاحة", ""];
    const blob = new Blob(["﻿" + [TEMPLATE_HEADERS.join(","), sample.join(",")].join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "value-aqar-units-template.csv"; a.click(); URL.revokeObjectURL(a.href);
  }
  async function read(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; e.target.value = "";
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("الملف أكبر من 5 ميجا"); return; }
    setBusy(true);
    try {
      let rows: unknown[][];
      if (/\.csv$/i.test(file.name)) rows = parseCsv(await file.text());
      else if (/\.xlsx$/i.test(file.name)) { const { readSheet } = await import("read-excel-file/browser"); rows = (await readSheet(file)) as unknown[][]; }
      else { toast.error("ارفع ملف Excel (.xlsx) أو CSV"); return; }
      setResult({ ...parseUnitsSheet(rows, existingCodes), file: file.name });
    } catch {
      toast.error("تعذّر قراءة الملف — اتأكد إنه Excel (.xlsx) أو CSV سليم");
    } finally { setBusy(false); }
  }
  async function save() {
    if (!result?.units.length) return;
    setBusy(true);
    const rows = result.units.map(({ row: _row, ...u }) => ({ ...u, project_id: projectId }));
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await dbx.from("project_units").insert(rows.slice(i, i + 200));
      if (error) {
        setBusy(false);
        toast.error(error.code === "23505" ? "فيه كود اتضاف من شوية لنفس المشروع — اقرا الملف تاني" : error.message);
        if (i > 0) { toast.info(`اتضاف ${i} وحدة قبل الخطأ`); onDone(); }
        return;
      }
    }
    setBusy(false);
    toast.success(`اتضافت ${rows.length} وحدة`);
    setResult(null); onDone();
  }

  return (
    <div className="space-y-3 rounded-2xl border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className={`${btnPrimary} cursor-pointer`}><FileSpreadsheet className="size-4" />{busy ? "..." : "اختار ملف Excel أو CSV"}<input type="file" accept=".xlsx,.csv" className="hidden" disabled={busy} onChange={read} /></label>
        <button onClick={template} className={btnOutline}><Download className="size-4" />تنزيل نموذج الأعمدة</button>
      </div>
      <p className="text-xs text-muted-foreground">
        الأعمدة: {TEMPLATE_HEADERS.join("، ")} — النوع والمساحة إجباريين. الحالة: متاحة / محجوزة / مباعة / غير متاحة (لو فاضية = متاحة). لحد {MAX_ROWS} صف في الملف. الأكواد المتكررة أو الموجودة في المشروع بتترفض.
      </p>
      {result && (
        <div className="space-y-3 border-t pt-3">
          <p className="text-sm font-bold text-primary">{result.file}: {result.units.length} وحدة سليمة{result.errors.length ? ` · ${result.errors.length} صف فيه أخطاء` : ""}</p>
          {result.errors.length > 0 && (
            <ul className="max-h-48 space-y-1 overflow-y-auto rounded-xl bg-destructive/5 p-3 text-xs text-destructive">
              {result.errors.map((er) => <li key={er.row}><b>صف {er.row}:</b> {er.message}</li>)}
            </ul>
          )}
          {result.units.length > 0 && (
            <div className="max-h-64 overflow-auto rounded-xl border">
              <table className="w-full min-w-[560px] text-xs">
                <thead className="sticky top-0 bg-secondary text-primary"><tr>{["صف", "الكود", "النوع", "المساحة", "الغرف", "الدور", "السعر", "الحالة"].map((h) => <th key={h} className="p-2 text-start">{h}</th>)}</tr></thead>
                <tbody>
                  {result.units.slice(0, 200).map((u) => (
                    <tr key={u.row} className="border-t"><td className="p-2">{u.row}</td><td className="p-2" dir="ltr">{u.code ?? "—"}</td><td className="p-2">{u.unit_type}</td><td className="p-2">{formatPrice(u.size)}</td><td className="p-2">{u.rooms ?? "—"}</td><td className="p-2">{u.floor ?? "—"}</td><td className="p-2">{u.price != null ? formatPrice(u.price) : "—"}</td><td className="p-2">{UNIT_STATUS[u.status]?.label}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <button disabled={busy || !result.units.length} onClick={save} className={btnPrimary}>{busy ? "..." : `استيراد ${result.units.length} وحدة`}</button>
            <button onClick={() => setResult(null)} className="h-11 px-4 text-sm font-bold text-muted-foreground hover:text-primary">إلغاء</button>
          </div>
          {result.errors.length > 0 && result.units.length > 0 && <p className="text-xs text-muted-foreground">الصفوف اللي فيها أخطاء مش هتتضاف — صلّحها وارفعها في ملف تاني.</p>}
        </div>
      )}
    </div>
  );
}
