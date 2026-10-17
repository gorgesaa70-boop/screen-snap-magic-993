import { useState } from "react";
import { toast } from "sonner";
import { Download, FileSpreadsheet } from "lucide-react";
import { dbx } from "@/lib/dbx";
import { inputCls, btnPrimary, btnOutline } from "@/components/site/ui";
import { MAX_PROJECTS, parseProjectsSheet, projectFields, type ProjectImport } from "@/lib/projects-import";
import { ColumnMapper, readSheetFile, shiftRows } from "./ColumnMapper";

/**
 * Upload many compounds (projects) from Excel. Developers add to their own account; the admin picks the
 * developer for the whole file. Units are added afterwards per compound (its own Excel template).
 */
export function ProjectsImport({ developerId, developers, onCancel, onDone }: {
  developerId?: string; developers?: { id: string; name: string }[]; onCancel: () => void; onDone: () => void;
}) {
  const [owner, setOwner] = useState(developerId ?? "");
  const [result, setResult] = useState<(ProjectImport & { file: string }) | null>(null);
  // Any file layout goes through «طابق الأعمدة» first.
  const [raw, setRaw] = useState<{ rows: unknown[][]; file: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const template = () => { const a = document.createElement("a"); a.href = "/templates/value-aqar-compounds-template.xlsx"; a.download = "value-aqar-compounds-template.xlsx"; a.click(); };

  async function read(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; e.target.value = "";
    if (!file) return;
    if (!owner) { toast.error("اختر شركة التطوير الأول"); return; }
    setBusy(true);
    try {
      setRaw({ rows: await readSheetFile(file), file: file.name });
      setResult(null);
    } catch (err) {
      toast.error(err instanceof Error && /ميجا|ارفع/.test(err.message) ? err.message : "تعذّر قراءة الملف — اتأكد إنه Excel (.xlsx) أو CSV سليم");
    } finally { setBusy(false); }
  }
  async function applyMapped(rows: unknown[][], offset: number) {
    if (!raw) return;
    const { data } = await dbx.from("projects").select("name").eq("developer_id", owner);
    const r = parseProjectsSheet(rows, (data ?? []).map((p) => p.name));
    setResult({ projects: shiftRows(r.projects, offset), errors: shiftRows(r.errors, offset), file: raw.file });
  }

  async function save() {
    if (!result?.projects.length || !owner) return;
    setBusy(true);
    const rows = result.projects.map(({ row: _row, ...p }) => ({ ...p, developer_id: owner }));
    const { error } = await dbx.from("projects").insert(rows);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`اتضاف ${rows.length} كمبوند — زوّد الصور والوحدات لكل واحد`);
    onDone();
  }

  return (
    <div className="space-y-3 rounded-2xl border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-extrabold text-primary">رفع كمبوندات من Excel</h2>
        <button onClick={onCancel} className="text-sm font-bold text-muted-foreground hover:text-primary">رجوع</button>
      </div>
      {developers && (
        <select aria-label="شركة التطوير" className={`${inputCls} sm:w-72`} value={owner} onChange={(e) => { setOwner(e.target.value); setResult(null); }}>
          <option value="">اختر شركة التطوير</option>{developers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <label className={`${btnPrimary} cursor-pointer`}><FileSpreadsheet className="size-4" />{busy ? "..." : "اختار ملف Excel أو CSV"}<input type="file" accept=".xlsx,.csv" className="hidden" disabled={busy || !owner} onChange={read} /></label>
        <button onClick={template} className={btnOutline}><Download className="size-4" />تنزيل نموذج المشروعات</button>
      </div>
      <p className="text-xs text-muted-foreground">
        ارفع ملفك بأي شكل وطابق الأعمدة. كل صف = كمبوند واحد (لو الملف فيه وحدات — مساحات وأسعار — ارفعه من «وحدات» جوه الكمبوند أو «رفع وحدات مولات»). الإجباري: اسم المشروع والمدينة (والمنطقة للمدن اللي فيها أحياء). المميزات من القايمة، مفصولة بـ «،». لحد {MAX_PROJECTS} كمبوند. الصور والوحدات بتتضاف بعدين لكل كمبوند.
      </p>
      {raw && !result && (
        <ColumnMapper importer="projects" file={raw.file} rows={raw.rows} fields={projectFields()} notesKey="الوصف" onCancel={() => setRaw(null)} onApply={(rows, offset) => void applyMapped(rows, offset)} />
      )}
      {result && (
        <div className="space-y-3 border-t pt-3">
          <button onClick={() => setResult(null)} className="text-xs font-bold text-primary underline">تعديل مطابقة الأعمدة</button>
          {result.errors.length >= 3 && result.errors.filter((e) => /متكرر|موجود/.test(e.message)).length >= result.errors.length * 0.8 && (
            <p className="rounded-xl bg-amber-50 p-3 text-xs font-bold text-amber-800">الملف ده شكله ملف وحدات (نفس الاسم متكرر في صفوف كتير)، مش ملف كمبوندات. متضيفوش هنا — ارفعه من «رفع وحدات مولات من Excel» أو من «الوحدات» جوه الكمبوند.</p>
          )}
          <p className="text-sm font-bold text-primary">{result.file}: {result.projects.length} كمبوند سليم{result.errors.length ? ` · ${result.errors.length} صف فيه أخطاء` : ""}</p>
          {result.errors.length > 0 && (
            <ul className="max-h-48 space-y-1 overflow-y-auto rounded-xl bg-destructive/5 p-3 text-xs text-destructive">
              {result.errors.map((er) => <li key={er.row}><b>صف {er.row}:</b> {er.message}</li>)}
            </ul>
          )}
          {result.projects.length > 0 && (
            <div className="max-h-64 overflow-auto rounded-xl border">
              <table className="w-full min-w-[560px] text-xs">
                <thead className="sticky top-0 bg-secondary text-primary"><tr>{["صف", "المشروع", "المدينة", "المنطقة", "التسليم", "المميزات"].map((h) => <th key={h} className="p-2 text-start">{h}</th>)}</tr></thead>
                <tbody>
                  {result.projects.map((p) => (
                    <tr key={p.row} className="border-t"><td className="p-2">{p.row}</td><td className="p-2">{p.name}</td><td className="p-2">{p.city}</td><td className="p-2">{p.area}</td><td className="p-2">{p.delivery_date ?? "—"}</td><td className="p-2">{p.amenities.length}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <button disabled={busy || !result.projects.length} onClick={save} className={btnPrimary}>{busy ? "..." : `إضافة ${result.projects.length} كمبوند`}</button>
            <button onClick={() => { setResult(null); setRaw(null); }} className="h-11 px-4 text-sm font-bold text-muted-foreground hover:text-primary">إلغاء</button>
          </div>
        </div>
      )}
    </div>
  );
}
