import { useState } from "react";
import { toast } from "sonner";
import { Download, FileSpreadsheet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { parseCsv } from "@/lib/units-import";
import { LISTING_HEADERS, MAX_LISTINGS, parseListingsSheet, type ListingImport } from "@/lib/properties-import";
import { formatPrice } from "@/components/site/data";
import { btnOutline, btnPrimary } from "@/components/site/ui";

/**
 * Item 32: upload many listings at once from Excel (.xlsx) or CSV. Everything is checked first (errors by row),
 * then the valid rows are saved as drafts — photos are added per listing before publishing — or published now.
 */
export function ListingsImport({ brokerId, remaining, onDone, onCancel }: { brokerId: string; remaining: number | null; onDone: () => void; onCancel: () => void }) {
  const [result, setResult] = useState<(ListingImport & { file: string }) | null>(null);
  const [publish, setPublish] = useState(false);
  const [busy, setBusy] = useState(false);

  function template() {
    const sample = ["شقة 3 غرف بحري", "شقة", "بيع", "برج العرب الجديدة", "الحي الأول", "1500000", "120", "3", "2", "تشطيب كامل، دور تاني"];
    const blob = new Blob(["﻿" + [LISTING_HEADERS.join(","), sample.join(",")].join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "value-aqar-listings-template.csv"; a.click(); URL.revokeObjectURL(a.href);
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
      setResult({ ...parseListingsSheet(rows), file: file.name });
    } catch {
      toast.error("تعذّر قراءة الملف — اتأكد إنه Excel (.xlsx) أو CSV سليم");
    } finally { setBusy(false); }
  }
  const over = result && remaining != null && result.listings.length > remaining;
  async function save() {
    if (!result?.listings.length || over) return;
    setBusy(true);
    const rows = result.listings.map(({ row: _row, ...l }) => ({
      ...l, broker_id: brokerId, category: "residential", review_status: (publish ? "pending" : "draft") as "pending" | "draft",
      ...(l.status === "مصيف" ? { price_night: l.price } : {}),
    }));
    let saved = 0;
    for (let i = 0; i < rows.length; i += 100) {
      const { error } = await supabase.from("properties").insert(rows.slice(i, i + 100));
      if (error) {
        setBusy(false);
        toast.error(error.message);
        if (saved) { toast.info(`اتضاف ${saved} عقار قبل الخطأ`); onDone(); }
        return;
      }
      saved += rows.slice(i, i + 100).length;
    }
    setBusy(false);
    toast.success(publish ? `اتنشر ${saved} عقار` : `اتضاف ${saved} عقار كمسودة — زوّد الصور وانشرهم`);
    onDone();
  }

  return (
    <div className="space-y-3 rounded-2xl border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-extrabold text-primary">رفع عقارات من Excel</h2>
        <button onClick={onCancel} className="text-sm font-bold text-muted-foreground hover:text-primary">رجوع</button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className={`${btnPrimary} cursor-pointer`}><FileSpreadsheet className="size-4" />{busy ? "..." : "اختار ملف Excel أو CSV"}<input type="file" accept=".xlsx,.csv" className="hidden" disabled={busy} onChange={read} /></label>
        <button onClick={template} className={btnOutline}><Download className="size-4" />تنزيل النموذج</button>
      </div>
      <p className="text-xs text-muted-foreground">
        الأعمدة: {LISTING_HEADERS.join("، ")}. الإجباري: النوع، الغرض (بيع / إيجار / مصيف)، المدينة، السعر (والمنطقة للمدن اللي فيها أحياء). لو العنوان فاضي بيتكتب لوحده. في المصيف السعر = سعر الليلة. لحد {MAX_LISTINGS} صف.
        {remaining != null && ` باقتك تسمح بـ ${formatPrice(Math.max(remaining, 0))} عقار كمان.`}
      </p>
      {result && (
        <div className="space-y-3 border-t pt-3">
          <p className="text-sm font-bold text-primary">{result.file}: {result.listings.length} عقار سليم{result.errors.length ? ` · ${result.errors.length} صف فيه أخطاء` : ""}</p>
          {result.errors.length > 0 && (
            <ul className="max-h-48 space-y-1 overflow-y-auto rounded-xl bg-destructive/5 p-3 text-xs text-destructive">
              {result.errors.map((er) => <li key={er.row}><b>صف {er.row}:</b> {er.message}</li>)}
            </ul>
          )}
          {over && <p className="rounded-xl bg-destructive/5 p-3 text-sm font-bold text-destructive">الملف فيه {result.listings.length} عقار وباقتك تسمح بـ {Math.max(remaining ?? 0, 0)} بس. قلّل الملف أو اطلب ترقية الباقة.</p>}
          {result.listings.length > 0 && (
            <div className="max-h-64 overflow-auto rounded-xl border">
              <table className="w-full min-w-[620px] text-xs">
                <thead className="sticky top-0 bg-secondary text-primary"><tr>{["صف", "العنوان", "النوع", "الغرض", "المنطقة", "السعر", "المساحة"].map((h) => <th key={h} className="p-2 text-start">{h}</th>)}</tr></thead>
                <tbody>
                  {result.listings.slice(0, 200).map((l) => (
                    <tr key={l.row} className="border-t"><td className="p-2">{l.row}</td><td className="p-2">{l.title}</td><td className="p-2">{l.type}</td><td className="p-2">{l.status}</td><td className="p-2">{l.area}</td><td className="p-2">{formatPrice(l.price)}</td><td className="p-2">{l.size ? formatPrice(l.size) : "—"}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <label className="flex items-center gap-2 text-sm font-bold text-primary">
            <input type="checkbox" className="size-4" checked={publish} onChange={(e) => setPublish(e.target.checked)} />
            انشرهم على طول (من غير صور هيظهروا بصورة افتراضية — الأفضل تسيبهم مسودة وتزوّد الصور)
          </label>
          <div className="flex flex-wrap gap-2">
            <button disabled={busy || !result.listings.length || !!over} onClick={save} className={btnPrimary}>{busy ? "..." : `إضافة ${result.listings.length} عقار`}</button>
            <button onClick={() => setResult(null)} className="h-11 px-4 text-sm font-bold text-muted-foreground hover:text-primary">إلغاء</button>
          </div>
          {result.errors.length > 0 && result.listings.length > 0 && <p className="text-xs text-muted-foreground">الصفوف اللي فيها أخطاء مش هتتضاف — صلّحها وارفعها في ملف تاني.</p>}
        </div>
      )}
    </div>
  );
}
