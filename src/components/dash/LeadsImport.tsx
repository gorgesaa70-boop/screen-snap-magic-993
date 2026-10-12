import { useState } from "react";
import { toast } from "sonner";
import { Download, FileSpreadsheet, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { parseCsv } from "@/lib/units-import";
import { LEAD_HEADERS, MAX_LEADS, parseLeadsSheet, type LeadImport } from "@/lib/leads-import";
import { LEAD_SOURCES } from "@/components/site/data";
import { btnOutline, btnPrimary } from "@/components/site/ui";

/**
 * CRM: import customers from Excel / CSV (admins and Value Aqar staff). Rows are checked first; numbers already in
 * the platform or repeated in the file are listed and skipped unless "add them anyway" is ticked — nothing is merged.
 * New leads go through the normal routing (rules, timer, notifications).
 */
export function LeadsImport({ existingPhones, onDone }: { existingPhones: string[]; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<(LeadImport & { file: string }) | null>(null);
  const [withDups, setWithDups] = useState(false);
  const [busy, setBusy] = useState(false);

  function template() {
    const sample = ["منى علي", "01012345678", "فيسبوك", "حملة أكتوبر", "شقة", "الحي الأول", "1500000", "عايزة 3 غرف"];
    const blob = new Blob(["﻿" + [LEAD_HEADERS.join(","), sample.join(",")].join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "value-aqar-leads-template.csv"; a.click(); URL.revokeObjectURL(a.href);
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
      setResult({ ...parseLeadsSheet(rows, existingPhones), file: file.name });
      setWithDups(false);
    } catch {
      toast.error("تعذّر قراءة الملف — اتأكد إنه Excel (.xlsx) أو CSV سليم");
    } finally { setBusy(false); }
  }
  const toAdd = result ? [...result.leads, ...(withDups ? result.duplicates : [])] : [];
  async function save() {
    if (!toAdd.length) return;
    setBusy(true);
    const rows = toAdd.map((l) => ({
      name: l.name, phone: l.phone, kind: "request", source: l.source, original_source: l.source, campaign: l.campaign,
      source_note: "رفع من Excel", property_type: l.property_type, area: l.area, budget: l.budget, details: l.details,
    }));
    let saved = 0;
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await supabase.from("leads").insert(rows.slice(i, i + 200));
      if (error) { setBusy(false); toast.error(error.message); if (saved) { toast.info(`اتضاف ${saved} عميل قبل الخطأ`); onDone(); } return; }
      saved += rows.slice(i, i + 200).length;
    }
    setBusy(false);
    toast.success(`اتضاف ${saved} عميل واتوزعوا حسب قواعد التوزيع`);
    setResult(null); setOpen(false); onDone();
  }

  if (!open) return <button onClick={() => setOpen(true)} className={btnOutline}><Upload className="size-4" />رفع عملاء من Excel</button>;
  return (
    <div className="w-full space-y-3 rounded-2xl border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-extrabold text-primary">رفع عملاء من Excel</h2>
        <button onClick={() => { setOpen(false); setResult(null); }} className="text-sm font-bold text-muted-foreground hover:text-primary">قفل</button>
      </div>
      <div className="flex flex-wrap gap-2">
        <label className={`${btnPrimary} cursor-pointer`}><FileSpreadsheet className="size-4" />{busy ? "..." : "اختار ملف Excel أو CSV"}<input type="file" accept=".xlsx,.csv" className="hidden" disabled={busy} onChange={read} /></label>
        <button onClick={template} className={btnOutline}><Download className="size-4" />تنزيل النموذج</button>
      </div>
      <p className="text-xs text-muted-foreground">الأعمدة: {LEAD_HEADERS.join("، ")}. الإجباري: الاسم والموبايل. المصدر بالعربي أو الإنجليزي (فيسبوك، واتساب، جوجل…) ولو مش معروف بيتسجل «ملف Excel». لحد {MAX_LEADS} صف. الأرقام المكررة مش بتتدمج.</p>
      {result && (
        <div className="space-y-3 border-t pt-3">
          <p className="text-sm font-bold text-primary">{result.file}: {result.leads.length} عميل جديد · {result.duplicates.length} رقم مكرر · {result.errors.length} صف فيه أخطاء</p>
          {result.errors.length > 0 && (
            <ul className="max-h-40 space-y-1 overflow-y-auto rounded-xl bg-destructive/5 p-3 text-xs text-destructive">{result.errors.map((er) => <li key={er.row}><b>صف {er.row}:</b> {er.message}</li>)}</ul>
          )}
          {result.duplicates.length > 0 && (
            <div className="rounded-xl bg-secondary p-3 text-xs">
              <ul className="max-h-40 space-y-1 overflow-y-auto">{result.duplicates.map((d) => <li key={d.row}><b>صف {d.row}:</b> {d.name} — <span dir="ltr">{d.phone}</span> — {d.reason}</li>)}</ul>
              <label className="mt-2 flex items-center gap-2 font-bold text-primary"><input type="checkbox" className="size-4" checked={withDups} onChange={(e) => setWithDups(e.target.checked)} />ضيفهم برضه كعملاء منفصلين</label>
            </div>
          )}
          {result.leads.length > 0 && (
            <div className="max-h-56 overflow-auto rounded-xl border">
              <table className="w-full min-w-[560px] text-xs">
                <thead className="sticky top-0 bg-secondary text-primary"><tr>{["صف", "الاسم", "الموبايل", "المصدر", "الحملة", "المنطقة"].map((h) => <th key={h} className="p-2 text-start">{h}</th>)}</tr></thead>
                <tbody>{result.leads.slice(0, 200).map((l) => <tr key={l.row} className="border-t"><td className="p-2">{l.row}</td><td className="p-2">{l.name}</td><td className="p-2" dir="ltr">{l.phone}</td><td className="p-2">{LEAD_SOURCES[l.source] ?? l.source}</td><td className="p-2">{l.campaign ?? "—"}</td><td className="p-2">{l.area ?? "—"}</td></tr>)}</tbody>
              </table>
            </div>
          )}
          <button disabled={busy || !toAdd.length} onClick={save} className={btnPrimary}>{busy ? "..." : `إضافة ${toAdd.length} عميل`}</button>
        </div>
      )}
    </div>
  );
}
