import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, FileSpreadsheet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatPrice } from "@/components/site/data";
import { fetchMalls } from "@/components/site/malls";
import { inputCls, btnPrimary, btnOutline } from "@/components/site/ui";
import { MAX_MALL_UNITS, mallUnitFields, parseMallUnitsSheet } from "@/lib/mall-units-import";
import { ColumnMapper, readSheetFile, shiftRows } from "./ColumnMapper";

/**
 * Upload many mall units from Excel. Brokers add to their own account (within their plan);
 * the admin picks the responsible broker for the whole file.
 */
export function MallUnitsImport({ brokerId, brokers, remaining, onCancel, onDone }: {
  brokerId?: string; brokers?: { id: string; name: string }[]; remaining?: number | null; onCancel: () => void; onDone: () => void;
}) {
  const malls = useQuery({ queryKey: ["malls-all"], queryFn: () => fetchMalls(true) });
  // Any file layout: the raw sheet goes through «طابق الأعمدة», then the parser reads the matched columns.
  const [raw, setRaw] = useState<{ rows: unknown[][]; file: string } | null>(null);
  const [mapped, setMapped] = useState<{ rows: unknown[][]; offset: number } | null>(null);
  const result = useMemo(() => {
    if (!raw || !mapped) return null;
    const r = parseMallUnitsSheet(mapped.rows, malls.data ?? []);
    return { units: shiftRows(r.units, mapped.offset), errors: shiftRows(r.errors, mapped.offset), file: raw.file };
  }, [raw, mapped, malls.data]);
  const fields = useMemo(() => mallUnitFields((malls.data ?? []).map((m) => m.name)), [malls.data]);
  const setResult = (v: null) => { setRaw(v); setMapped(v); };
  const [owner, setOwner] = useState(brokerId ?? "");
  const [publish, setPublish] = useState(false);
  const [busy, setBusy] = useState(false);
  const template = () => { const a = document.createElement("a"); a.href = "/templates/value-aqar-mall-units-template.xlsx"; a.download = "value-aqar-mall-units-template.xlsx"; a.click(); };

  async function read(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      setRaw({ rows: await readSheetFile(file), file: file.name });
      setMapped(null);
    } catch (err) {
      toast.error(err instanceof Error && /ميجا|ارفع/.test(err.message) ? err.message : "تعذّر قراءة الملف — اتأكد إنه Excel (.xlsx) أو CSV سليم");
    } finally { setBusy(false); }
  }

  const over = !!result && remaining != null && result.units.length > remaining;
  async function save() {
    if (!result?.units.length || over) return;
    if (!owner) { toast.error("اختر الوسيط المسؤول عن الوحدات"); return; }
    setBusy(true);
    const isAdmin = !!brokers;
    const rows = result.units.map(({ row: _row, note: _note, ...u }) => ({
      ...u, category: "mall", broker_id: owner, rooms: null, baths: null,
      review_status: (isAdmin ? (publish ? "approved" : "draft") : publish ? "pending" : "draft") as "pending" | "draft" | "approved",
    }));
    let saved = 0;
    for (let i = 0; i < rows.length; i += 100) {
      const { error } = await supabase.from("properties").insert(rows.slice(i, i + 100));
      if (error) {
        setBusy(false);
        toast.error(error.message);
        if (saved) { toast.info(`اتضاف ${saved} وحدة قبل الخطأ`); onDone(); }
        return;
      }
      saved += rows.slice(i, i + 100).length;
    }
    setBusy(false);
    toast.success(publish ? (brokerId ? `اتبعت ${saved} وحدة للمراجعة — هيظهروا أول ما الإدارة تعتمدهم` : `اتنشر ${saved} وحدة`) : `اتضاف ${saved} وحدة كمسودة — زوّد الصور وانشرهم`);
    onDone();
  }

  return (
    <div className="space-y-3 rounded-2xl border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-extrabold text-primary">رفع وحدات مولات من Excel</h2>
        <button onClick={onCancel} className="text-sm font-bold text-muted-foreground hover:text-primary">رجوع</button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className={`${btnPrimary} cursor-pointer`}><FileSpreadsheet className="size-4" />{busy ? "..." : "اختار ملف Excel أو CSV"}<input type="file" accept=".xlsx,.csv" className="hidden" disabled={busy || malls.isLoading} onChange={read} /></label>
        <button onClick={template} className={btnOutline}><Download className="size-4" />تنزيل نموذج المولات</button>
      </div>
      <p className="text-xs text-muted-foreground">
        ارفع ملف المول بأي شكل — بعدها هتطابق الأعمدة (المول والنوع والدور والغرض ممكن تختار لهم قيمة واحدة لكل الصفوف). السعر إجمالي أو سعر متر (بيتضرب في المساحة)، والتقسيط بيتحسب من نص نظام السداد. لحد {MAX_MALL_UNITS} صف.
        {remaining != null && ` باقتك تسمح بـ ${formatPrice(Math.max(remaining, 0))} وحدة كمان.`}
      </p>
      {raw && !mapped && (
        <ColumnMapper importer="mall-units" file={raw.file} rows={raw.rows} fields={fields} notesKey="الوصف"
          onApply={(rows, offset) => setMapped({ rows, offset })} onCancel={() => setResult(null)} />
      )}
      {result && (
        <div className="space-y-3 border-t pt-3">
          <button onClick={() => setMapped(null)} className="text-xs font-bold text-primary underline">تعديل مطابقة الأعمدة</button>
          <p className="text-sm font-bold text-primary">{result.file}: {result.units.length} وحدة سليمة{result.errors.length ? ` · ${result.errors.length} صف فيه أخطاء` : ""}</p>
          {result.errors.length > 0 && (
            <ul className="max-h-48 space-y-1 overflow-y-auto rounded-xl bg-destructive/5 p-3 text-xs text-destructive">
              {result.errors.map((er) => <li key={er.row}><b>صف {er.row}:</b> {er.message}</li>)}
            </ul>
          )}
          {over && <p className="rounded-xl bg-destructive/5 p-3 text-sm font-bold text-destructive">الملف فيه {result.units.length} وحدة وباقتك تسمح بـ {Math.max(remaining ?? 0, 0)} بس. قلّل الملف أو اطلب ترقية الباقة.</p>}
          {result.units.length > 0 && (
            <div className="max-h-64 overflow-auto rounded-xl border">
              <table className="w-full min-w-[760px] text-xs">
                <thead className="sticky top-0 bg-secondary text-primary"><tr>{["صف", "المول", "الوحدة", "النوع", "الدور", "الغرض", "المساحة", "السعر", "راجع"].map((h) => <th key={h} className="p-2 text-start">{h}</th>)}</tr></thead>
                <tbody>
                  {result.units.slice(0, 200).map((u) => (
                    <tr key={u.row} className="border-t"><td className="p-2">{u.row}</td><td className="p-2">{u.area}</td><td className="p-2">{u.title}</td><td className="p-2">{u.type}</td><td className="p-2">{u.floor}</td><td className="p-2">{u.status}</td><td className="p-2">{formatPrice(u.size)}</td><td className="p-2">{formatPrice(u.price)}</td><td className="p-2 text-amber-700">{u.note ?? ""}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {brokers && (
            <select aria-label="الوسيط المسؤول" className={`${inputCls} sm:w-72`} value={owner} onChange={(e) => setOwner(e.target.value)}>
              <option value="">اختر الوسيط المسؤول عن الوحدات</option>{brokers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          )}
          <label className="flex items-center gap-2 text-sm font-bold text-primary">
            <input type="checkbox" className="size-4" checked={publish} onChange={(e) => setPublish(e.target.checked)} />
            انشرهم على طول (من غير صور هيظهروا بصورة افتراضية — الأفضل تسيبهم مسودة وتزوّد الصور)
          </label>
          <div className="flex flex-wrap gap-2">
            <button disabled={busy || !result.units.length || over} onClick={save} className={btnPrimary}>{busy ? "..." : `إضافة ${result.units.length} وحدة`}</button>
            <button onClick={() => setResult(null)} className="h-11 px-4 text-sm font-bold text-muted-foreground hover:text-primary">إلغاء</button>
          </div>
          {result.errors.length > 0 && result.units.length > 0 && <p className="text-xs text-muted-foreground">الصفوف اللي فيها أخطاء مش هتتضاف — صلّحها وارفعها في ملف تاني.</p>}
        </div>
      )}
    </div>
  );
}
