import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { dbx } from "@/lib/dbx";
import { cleanPhone } from "@/lib/phone";
import { Field, inputCls, btnPrimary } from "@/components/site/ui";
import { WHATSAPP_NUMBER } from "@/components/site/data";
import { useFloatingWhatsapp } from "@/components/site/FloatingWhatsApp";

/** Digits with the country code, as WhatsApp links need them (01012345678 → 201012345678). */
function toWaDigits(v: string): string | null | undefined {
  if (!v.trim()) return null;
  const c = cleanPhone(v);
  return c ? (c.startsWith("+") ? c.slice(1) : "20" + c.slice(1)) : undefined;
}

/** لوحة الإدارة ← الإعدادات ← رقم الواتساب العائم. */
export function WhatsappSettingsAdmin() {
  const q = useFloatingWhatsapp();
  const qc = useQueryClient();
  const [num, setNum] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (q.data) setNum("+" + q.data); }, [q.data]);

  async function save() {
    const digits = toWaDigits(num);
    if (digits === undefined) { toast.error("الرقم مش صحيح — اكتبه زي 01012345678 أو بمفتاح الدولة +966…"); return; }
    setBusy(true);
    const { error } = await dbx.from("app_settings").update({ floating_whatsapp: digits }).eq("id", 1);
    setBusy(false);
    if (error) { toast.error(/floating_whatsapp/.test(error.message) ? "الخانة دي محتاجة تحديث قاعدة البيانات (إصدار 33)" : error.message); return; }
    toast.success(digits ? "اتغيّر رقم الواتساب العائم" : "رجع للرقم الأساسي");
    qc.invalidateQueries({ queryKey: ["floating-whatsapp"] });
  }

  const current = q.data || WHATSAPP_NUMBER;
  return (
    <div className="max-w-2xl space-y-4 rounded-2xl border bg-card p-4 md:p-6">
      <p className="text-sm text-muted-foreground">زرار الواتساب الأخضر اللي بيظهر في ركن الصفحات للزوار. لو سبت الخانة فاضية، بيفتح على الرقم الأساسي.</p>
      <p className="text-sm font-bold text-primary">بيفتح دلوقتي على: <span dir="ltr">+{current}</span>{q.data ? "" : " (الأساسي)"}</p>
      <Field label="رقم الواتساب العائم">
        <input dir="ltr" inputMode="tel" className={inputCls} placeholder="01012345678" value={num} onChange={(e) => setNum(e.target.value)} maxLength={20} />
      </Field>
      <div className="flex flex-wrap gap-2">
        <button disabled={busy} onClick={save} className={btnPrimary}>{busy ? "..." : "حفظ"}</button>
        {q.data && <button disabled={busy} onClick={() => { setNum(""); void (async () => { setBusy(true); const { error } = await dbx.from("app_settings").update({ floating_whatsapp: null }).eq("id", 1); setBusy(false); if (error) toast.error(error.message); else { toast.success("رجع للرقم الأساسي"); qc.invalidateQueries({ queryKey: ["floating-whatsapp"] }); } })(); }} className="h-11 rounded-xl border px-4 text-sm font-bold text-primary">رجّع الرقم الأساسي</button>}
        <a href={`https://wa.me/${current}`} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center rounded-xl px-4 text-sm font-bold text-teal underline">جرّب الرقم</a>
      </div>
    </div>
  );
}
