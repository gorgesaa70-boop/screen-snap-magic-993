import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatDate } from "@/components/site/data";
import { Field, inputCls, btnPrimary, btnOutline } from "@/components/site/ui";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- types regenerate after the release migration applies
const db = supabase as any;

export const MEMBER_ROLES: Record<string, { label: string; hint: string }> = {
  manager: { label: "مدير", hint: "يدير العقارات والمشروعات والعملاء" },
  sales: { label: "موظف مبيعات", hint: "يتابع العملاء والطلبات بس" },
  broker: { label: "بروكر تابع", hint: "يتابع العملاء والطلبات بس" },
};

/** Company owner adds team members by phone; they sign in with that phone and work inside the company account. */
export function CompanyTeam({ companyId }: { companyId: string }) {
  const q = useQuery({
    queryKey: ["company-team", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("company_members").select("*").eq("company_id", companyId).order("created_at");
      if (error) throw error; return data;
    },
  });
  const [f, setF] = useState({ name: "", phone: "", role: "sales" });
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (f.name.trim().length < 2 || !/^[0-9+\s]{8,20}$/.test(f.phone.trim())) { toast.error("اكتب الاسم ورقم موبايل صحيح"); return; }
    setBusy(true);
    const { error } = await supabase.from("company_members").insert({ company_id: companyId, name: f.name.trim(), phone: f.phone.trim(), role: f.role });
    setBusy(false);
    if (error) { toast.error(error.code === "23505" ? "الرقم ده مضاف بالفعل لفريق شركة" : error.message); return; }
    toast.success("تمت الإضافة — يقدر يدخل برقمه دلوقتي");
    setF({ name: "", phone: "", role: "sales" }); setOpen(false); q.refetch();
  }
  async function upd(id: string, patch: { role?: string; is_active?: boolean }) {
    const { error } = await supabase.from("company_members").update(patch).eq("id", id);
    if (error) toast.error(error.message); else { toast.success("تم التحديث"); q.refetch(); }
  }

  const list = q.data ?? [];
  return (
    <div className="space-y-3">
      <p className="max-w-2xl text-sm text-muted-foreground">ضيف فريقك برقم الموبايل. كل واحد يدخل برقمه بكود واتساب، ويشتغل جوه حساب الشركة حسب صلاحيته، ومحدش يشوف بيانات شركة تانية.</p>
      <button onClick={() => setOpen(!open)} className={btnPrimary}><Plus className="size-4" />{open ? "إغلاق" : "إضافة عضو"}</button>
      {open && (
        <form onSubmit={add} className="grid gap-3 rounded-2xl border bg-card p-4 sm:grid-cols-3">
          <Field label="الاسم"><input className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={100} /></Field>
          <Field label="رقم الموبايل"><input className={inputCls} dir="ltr" inputMode="tel" placeholder="01xxxxxxxxx" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} maxLength={20} /></Field>
          <Field label="الصلاحية"><select className={inputCls} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>{Object.entries(MEMBER_ROLES).map(([k, v]) => <option key={k} value={k}>{v.label} — {v.hint}</option>)}</select></Field>
          <button disabled={busy} className={`${btnPrimary} sm:col-span-3`}>{busy ? "..." : "حفظ"}</button>
        </form>
      )}
      {!q.isLoading && list.length === 0 && <p className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">لسه مفيش أعضاء في الفريق.</p>}
      {list.map((m) => (
        <div key={m.id} className={`flex flex-col gap-3 rounded-2xl border bg-card p-4 md:flex-row md:items-center ${m.is_active ? "" : "opacity-60"}`}>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-primary">{m.name} {!m.is_active && <span className="text-xs text-destructive">(موقوف)</span>}</p>
            <p className="text-xs text-muted-foreground"><span dir="ltr">+{m.phone}</span> · أضيف {formatDate(m.created_at)}</p>
          </div>
          <select aria-label="الصلاحية" className={`${inputCls} md:w-48`} value={m.role} onChange={(e) => upd(m.id, { role: e.target.value })}>
            {Object.entries(MEMBER_ROLES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <div className="flex gap-2">
            <button className={btnOutline} onClick={() => upd(m.id, { is_active: !m.is_active })}>{m.is_active ? "إيقاف" : "تفعيل"}</button>
            <button aria-label="حذف" onClick={async () => { if (!confirm(`حذف ${m.name} من الفريق؟`)) return; const { error } = await supabase.from("company_members").delete().eq("id", m.id); if (error) toast.error(error.message); else q.refetch(); }} className="grid size-11 place-items-center rounded-xl border text-destructive hover:bg-destructive/10"><Trash2 className="size-4" /></button>
          </div>
        </div>
      ))}
    </div>
  );
}
