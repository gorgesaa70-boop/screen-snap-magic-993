import { useState } from "react";
import { toast } from "sonner";
import { Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { btnOutline } from "@/components/site/ui";
import { leadNo, leadKindLabel, formatDate } from "@/components/site/data";
import type { LeadWithProp } from "./LeadsBoard";

/**
 * «مسح عملاء»: tick several leads from the current (filtered) list and delete them in one go through admin_delete().
 * Two confirmations for the whole batch; a lead with a deal is refused by the server and stays.
 */
export function LeadsBulkDelete({ list, onDone }: { list: LeadWithProp[]; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState(false);
  const visible = list.filter((l) => sel.has(l.id)).length;
  const allOn = list.length > 0 && visible === list.length;

  const toggle = (id: string) => setSel((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const close = () => { setOpen(false); setSel(new Set()); };

  async function run() {
    const ids = list.filter((l) => sel.has(l.id)).map((l) => l.id);
    if (!ids.length) return;
    if (!confirm(`متأكد إنك عايز تمسح ${ids.length} عميل؟\nالمهام والرسايل وسجل التواصل بتاعهم هيتمسحوا معاهم.`)) return;
    if (!confirm("تأكيد أخير: الحذف نهائي ومش هيرجع.")) return;
    setBusy(true);
    let ok = 0;
    const failed: string[] = [];
    for (const id of ids) {
      const { error } = await supabase.rpc("admin_delete", { _kind: "lead", _id: id });
      if (error) failed.push(`${list.find((l) => l.id === id)?.name ?? id}: ${error.code === "42501" ? "الحذف للإدارة بس" : error.message}`);
      else ok++;
    }
    setBusy(false);
    if (ok) toast.success(`اتمسح ${ok} عميل`);
    if (failed.length) toast.error(`مااتمسحش ${failed.length}:\n${failed.join("\n")}`, { duration: 12000 });
    close();
    onDone();
  }

  if (!open) {
    return <button className={btnOutline} disabled={!list.length} onClick={() => setOpen(true)}><Trash2 className="size-4" />مسح عملاء</button>;
  }
  return (
    <div className="w-full space-y-3 rounded-2xl border border-destructive/40 bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-bold text-primary">اختار العملاء اللي عايز تمسحهم ({visible} من {list.length})</p>
        <div className="flex flex-wrap gap-2">
          <button className={btnOutline} onClick={() => setSel(allOn ? new Set() : new Set(list.map((l) => l.id)))}>{allOn ? "إلغاء تحديد الكل" : "تحديد الكل"}</button>
          <button disabled={!visible || busy} onClick={run}
            className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-destructive px-4 text-sm font-bold text-destructive-foreground disabled:opacity-50">
            <Trash2 className="size-4" />{busy ? "جاري المسح..." : `امسح المحدد (${visible})`}
          </button>
          <button className={btnOutline} disabled={busy} onClick={close}><X className="size-4" />إلغاء</button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">القايمة دي حسب الفلاتر والبحث اللي فوق. العميل اللي عليه صفقة مش هيتمسح عشان سجل العمولات.</p>
      <ul className="max-h-96 divide-y overflow-y-auto rounded-xl border">
        {list.map((l) => (
          <li key={l.id}>
            <label className="flex cursor-pointer items-center gap-3 p-3 hover:bg-secondary/40">
              <input type="checkbox" className="size-5 accent-destructive" checked={sel.has(l.id)} onChange={() => toggle(l.id)} />
              <span className="min-w-0 flex-1">
                <span className="font-bold text-primary">{l.name}</span>
                <span className="block text-xs text-muted-foreground">{leadKindLabel(l)} · <span dir="ltr">{leadNo(l.lead_no)}</span> · <span dir="ltr">{l.phone}</span> · {formatDate(l.created_at)}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
