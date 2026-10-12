import { useState } from "react";
import { toast } from "sonner";
import { Download, FileSpreadsheet } from "lucide-react";
import { dbx } from "@/lib/dbx";
import { inputCls, btnPrimary, btnOutline } from "@/components/site/ui";
import { PROJECT_HEADERS, MAX_PROJECTS, parseProjectsSheet, type ProjectImport } from "@/lib/projects-import";

/**
 * Upload many compounds (projects) from Excel. Developers add to their own account; the admin picks the
 * developer for the whole file. Units are added afterwards per compound (its own Excel template).
 */
export function ProjectsImport({ developerId, developers, onCancel, onDone }: {
  developerId?: string; developers?: { id: string; name: string }[]; onCancel: () => void; onDone: () => void;
}) {
  const [owner, setOwner] = useState(developerId ?? "");
  const [result, setResult] = useState<(ProjectImport & { file: string }) | null>(null);
  const [busy, setBusy] = useState(false);
  const template = () => { const a = document.createElement("a"); a.href = "/templates/value-aqar-compounds-template.xlsx"; a.download = "value-aqar-compounds-template.xlsx"; a.click(); };

  async function read(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; e.target.value = "";
    if (!file) return;
    if (!owner) { toast.error("اختر شركة التطوير الأول"); return; }
    if (!/\.xlsx$/i.test(file.name)) { toast.error("ارفع ملف Excel (.xlsx)"); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("الملف أكبر من 5 ميجا"); return; }
    setBusy(true);
    try {
      const { readSheet } = await import("read-excel-file/browser");
      const rows = (await readSheet(file)) as unknown[][];
      const { data } = await dbx.from("projects").select("name").eq("developer_id", owner);
      setResult({ ...parseProjectsSheet(rows, (data ?? []).map((p) => p.name)), file: file.name });
    } catch {
      toast.error("تعذّر قراءة الملف — اتأكد إنه Excel (.xlsx) سليم");
    } finally { setBusy(false); }
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
        <label className={`${btnPrimary} cursor-pointer`}><FileSpreadsheet className="size-4" />{busy ? "..." : "اختار ملف Excel"}<input type="file" accept=".xlsx" className="hidden" disabled={busy || !owner} onChange={read} /></label>
        <button onClick={template} className={btnOutline}><Download className="size-4" />تنزيل نموذج الكمبوندات</button>
      </div>
      <p className="text-xs text-muted-foreground">
        الأعمدة: {PROJECT_HEADERS.join("، ")}. الإجباري: اسم الكمبوند والمدينة (والمنطقة للمدن اللي فيها أحياء). المميزات من القايمة، مفصولة بـ «،». لحد {MAX_PROJECTS} كمبوند. الصور والوحدات بتتضاف بعدين لكل كمبوند.
      </p>
      {result && (
        <div className="space-y-3 border-t pt-3">
          <p className="text-sm font-bold text-primary">{result.file}: {result.projects.length} كمبوند سليم{result.errors.length ? ` · ${result.errors.length} صف فيه أخطاء` : ""}</p>
          {result.errors.length > 0 && (
            <ul className="max-h-48 space-y-1 overflow-y-auto rounded-xl bg-destructive/5 p-3 text-xs text-destructive">
              {result.errors.map((er) => <li key={er.row}><b>صف {er.row}:</b> {er.message}</li>)}
            </ul>
          )}
          {result.projects.length > 0 && (
            <div className="max-h-64 overflow-auto rounded-xl border">
              <table className="w-full min-w-[560px] text-xs">
                <thead className="sticky top-0 bg-secondary text-primary"><tr>{["صف", "الكمبوند", "المدينة", "المنطقة", "التسليم", "المميزات"].map((h) => <th key={h} className="p-2 text-start">{h}</th>)}</tr></thead>
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
            <button onClick={() => setResult(null)} className="h-11 px-4 text-sm font-bold text-muted-foreground hover:text-primary">إلغاء</button>
          </div>
        </div>
      )}
    </div>
  );
}
