import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { addStaff, listStaff, removeStaff } from "@/lib/admin.functions";
import { Field, inputCls, btnPrimary } from "@/components/site/ui";

/** Value Aqar's own employees: they follow up and assign customer requests, without full admin rights. */
export function StaffAdmin() {
  const list = useServerFn(listStaff);
  const add = useServerFn(addStaff);
  const remove = useServerFn(removeStaff);
  const q = useQuery({ queryKey: ["staff"], queryFn: async () => { const r = await list(); if (!r.ok) throw new Error(r.error); return r.staff; } });
  const [f, setF] = useState({ name: "", phone: "" });
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await add({ data: f });
      if (!r.ok) toast.error(r.error); else { toast.success("تمت الإضافة — يقدر يدخل برقمه دلوقتي"); setF({ name: "", phone: "" }); q.refetch(); }
    } catch { toast.error("اكتب الاسم ورقم موبايل صحيح"); }
    setBusy(false);
  }

  return (
    <div className="space-y-3">
      <p className="max-w-2xl text-sm text-muted-foreground">موظفين فاليو عقار بيدخلوا برقم الموبايل، ويقدروا يشوفوا كل طلبات العملاء ويتابعوها ويوزّعوها على الوسطاء والشركات. ماعندهمش صلاحيات الإدارة الكاملة (الباقات، اعتماد الحسابات، الحذف).</p>
      <form onSubmit={submit} className="grid gap-3 rounded-2xl border bg-card p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <Field label="الاسم"><input required className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={100} /></Field>
        <Field label="رقم الموبايل"><input required className={inputCls} dir="ltr" inputMode="tel" placeholder="01xxxxxxxxx" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} maxLength={20} /></Field>
        <button disabled={busy} className={btnPrimary}><Plus className="size-4" />إضافة موظف</button>
      </form>
      {q.error && <p className="rounded-2xl border bg-card p-4 text-sm text-destructive">{(q.error as Error).message}</p>}
      {q.data?.length === 0 && <p className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">لسه مفيش موظفين.</p>}
      {q.data?.map((s) => (
        <div key={s.userId} className="flex items-center gap-3 rounded-2xl border bg-card p-4">
          <div className="min-w-0 flex-1">
            <p className="font-bold text-primary">{s.name || "—"}</p>
            <p className="text-xs text-muted-foreground" dir="ltr">{s.phone ? `+${s.phone}` : ""}</p>
          </div>
          <button aria-label="إزالة" onClick={async () => { if (!confirm(`إزالة ${s.name || "الموظف"} من فريق فاليو عقار؟`)) return; const r = await remove({ data: { userId: s.userId } }); if (!r.ok) toast.error(r.error); else q.refetch(); }} className="grid size-11 place-items-center rounded-xl border text-destructive hover:bg-destructive/10"><Trash2 className="size-4" /></button>
        </div>
      ))}
    </div>
  );
}
