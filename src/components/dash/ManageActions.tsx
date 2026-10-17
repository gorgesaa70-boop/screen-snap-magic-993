import { useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { inputCls } from "@/components/site/ui";
import { AVAILABILITY, availabilityOf, type Availability } from "@/components/site/availability";

export type DeleteKind = "property" | "mall" | "project" | "opportunity" | "lead" | "service_request" | "service_provider" | "service_plan" | "location";

const RESULT: Record<string, string> = {
  deleted: "اتمسح",
  hidden: "مااتمسحش لأن عليه صفقة — اتخفى من الموقع بدل كده",
  deactivated: "عليه طلبات أو مشتركين — اتوقف بدل ما يتمسح",
};

/**
 * Admin delete through admin_delete() (release 30), with two confirmations. Anything tied to a deal or commission is
 * hidden or turned off by the server instead of deleted.
 */
export async function adminDelete(kind: DeleteKind, id: string, name: string, opts: { target?: string | undefined; extra?: string | undefined } = {}) {
  if (!confirm(`متأكد إنك عايز تمسح «${name}»؟${opts.extra ? `\n${opts.extra}` : ""}`)) return null;
  if (!confirm("تأكيد أخير: الحذف نهائي ومش هيرجع.")) return null;
  const { data, error } = await supabase.rpc("admin_delete", { _kind: kind, _id: id, ...(opts.target ? { _target: opts.target } : {}) });
  if (error) {
    toast.error(error.code === "PGRST202" ? "الحذف محتاج تحديث قاعدة البيانات (إصدار 30)" : error.code === "42501" ? "الحذف للإدارة بس" : error.message);
    return null;
  }
  const r = String(data);
  (r === "deleted" ? toast.success : toast.info)(RESULT[r] ?? r);
  return r;
}

/** Small «حذف» button for admin lists. */
export function DeleteButton({ kind, id, name, extra, onDone, label = "حذف" }: { kind: DeleteKind; id: string; name: string; extra?: string | undefined; onDone: () => void; label?: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button type="button" disabled={busy} onClick={async () => { setBusy(true); const r = await adminDelete(kind, id, name, { extra }); setBusy(false); if (r) onDone(); }}
      className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-destructive/40 px-3 text-sm font-bold text-destructive hover:bg-destructive/5 disabled:opacity-50">
      <Trash2 className="size-4" />{busy ? "..." : label}
    </button>
  );
}

/** Available / reserved / sold for a listing or mall unit (owner, manager or admin). Saves on change. */
export function AvailabilitySelect({ p, onChanged, compact }: { p: { id: string; availability?: string | null | undefined }; onChanged?: (a: Availability) => void; compact?: boolean }) {
  const [value, setValue] = useState<Availability>(availabilityOf(p));
  const [busy, setBusy] = useState(false);
  async function change(a: Availability) {
    const prev = value;
    setValue(a); setBusy(true);
    const { error } = await supabase.from("properties").update({ availability: a }).eq("id", p.id);
    setBusy(false);
    if (error) { setValue(prev); toast.error(/availability/.test(error.message) ? "حالة الوحدة محتاجة تحديث قاعدة البيانات (إصدار 30)" : error.message); return; }
    toast.success(`بقت «${AVAILABILITY[a].label}»`);
    onChanged?.(a);
  }
  return (
    <select aria-label="حالة الوحدة" disabled={busy} value={value} onChange={(e) => change(e.target.value as Availability)}
      className={`${inputCls} ${compact ? "h-9 text-xs" : "h-11"} w-auto font-bold`}>
      {(Object.keys(AVAILABILITY) as Availability[]).map((k) => <option key={k} value={k}>{AVAILABILITY[k].label}</option>)}
    </select>
  );
}
