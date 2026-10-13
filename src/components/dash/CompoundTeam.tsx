import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, UserRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatDate, formatPrice } from "@/components/site/data";
import { COMPOUND_ROLE_LABEL, type CompoundRow } from "@/components/site/compounds";
import { inputCls, btnPrimary } from "@/components/site/ui";
import { useAssignable } from "@/components/dash/Tasks";
import type { CompoundLead } from "@/components/dash/CompoundLeads";

const CLOSED = ["sold", "lost"];

/** People working on one compound, with what each of them is carrying: requests, open follow-ups, sales, last update. */
export function CompoundTeam({ compound, canStaff, leads }: { compound: CompoundRow; canStaff: boolean; leads: CompoundLead[] }) {
  const runByVa = !compound.developer_id;
  const q = useQuery({
    queryKey: ["compound-members", compound.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("compound_members").select("*, company_members(name, role, is_active)").eq("compound_id", compound.id).order("created_at");
      if (error) throw error; return data;
    },
  });
  // Developer's team (owner and company managers can read it) or Value Aqar staff (admins can list them).
  const team = useQuery({
    queryKey: ["compound-candidates", compound.developer_id], enabled: canStaff && !runByVa,
    queryFn: async () => (await supabase.from("company_members").select("id, name, role").eq("company_id", compound.developer_id!).eq("is_active", true).order("name")).data ?? [],
  });
  const people = useAssignable();
  const staffName = (id: string | null) => people.data?.find((p) => p.user_id === id)?.label ?? "موظف فاليو عقار";
  const staffList = (people.data ?? []).filter((p) => p.label.startsWith("موظف"));
  const [pick, setPick] = useState({ who: "", role: "sales" });
  const [busy, setBusy] = useState(false);
  const rows = q.data ?? [];
  const taken = new Set(rows.map((r) => r.member_id ?? r.staff_user_id));
  const candidates = runByVa ? staffList.map((s) => ({ id: s.user_id, name: s.label })) : (team.data ?? []).map((m) => ({ id: m.id, name: m.name }));

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!pick.who) return;
    setBusy(true);
    const { error } = await supabase.from("compound_members").insert({ compound_id: compound.id, role: pick.role, ...(runByVa ? { staff_user_id: pick.who } : { member_id: pick.who }) });
    setBusy(false);
    if (error) { toast.error(error.code === "23505" ? "الشخص ده على الكمبوند بالفعل" : error.message); return; }
    toast.success("اتضاف للفريق، ووصله إشعار");
    setPick({ who: "", role: "sales" }); q.refetch();
  }

  const statsFor = (r: (typeof rows)[number]) => {
    const mine = leads.filter((l) => (r.member_id ? l.assigned_member_id === r.member_id : l.assigned_staff_id === r.staff_user_id));
    const last = mine.map((l) => l.updated_at).sort().at(-1);
    return { total: mine.length, open: mine.filter((l) => !CLOSED.includes(l.stage)).length, sold: mine.filter((l) => l.stage === "sold").length, last };
  };
  const unassigned = leads.filter((l) => !l.assigned_member_id && !l.assigned_staff_id && !CLOSED.includes(l.stage)).length;

  return (
    <div className="space-y-3">
      <p className="max-w-2xl text-sm text-muted-foreground">
        {runByVa
          ? "فاليو عقار بتدير الكمبوند ده دلوقتي، فالفريق من موظفين فاليو عقار. أول ما الكمبوند يتسلم لحساب المطور، فريقه هو اللي هيشتغل عليه."
          : "مدير الكمبوند بيعدّل الوحدات والبيانات ويتابع كل طلبات الكمبوند. المبيعات بيغيّروا حالة الوحدة (حجز / بيع) ويتابعوا الطلبات اللي معاهم. صاحب الحساب ومديرين الشركة شايفين كل الكمبوندات من غير تعيين."}
      </p>
      {canStaff && (
        <form onSubmit={add} className="flex flex-wrap items-end gap-2 rounded-2xl border bg-card p-3">
          <select aria-label="مين" className={`${inputCls} w-auto min-w-48 flex-1`} value={pick.who} onChange={(e) => setPick({ ...pick, who: e.target.value })}>
            <option value="">{runByVa ? "اختار موظف من فاليو عقار" : "اختار من فريقك"}</option>
            {candidates.filter((c) => !taken.has(c.id)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select aria-label="الدور في الكمبوند" className={`${inputCls} w-auto`} value={pick.role} onChange={(e) => setPick({ ...pick, role: e.target.value })}>
            <option value="sales">مبيعات</option><option value="manager">مدير كمبوند</option>
          </select>
          <button disabled={busy || !pick.who} className={btnPrimary}><Plus className="size-4" />إضافة للفريق</button>
          {!runByVa && candidates.length === 0 && !team.isLoading && <p className="w-full text-xs text-muted-foreground">لسه مفيش فريق في حسابك. ضيف فريقك الأول من تبويب «الفريق» في لوحتك.</p>}
        </form>
      )}
      {unassigned > 0 && <p className="rounded-xl bg-[#f2b84b]/20 p-3 text-sm font-bold text-primary">فيه {formatPrice(unassigned)} طلب مفتوح على الكمبوند من غير مسؤول — وزّعهم من صفحة الطلب.</p>}
      {!q.isLoading && rows.length === 0 && <p className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">لسه مفيش حد متعين على الكمبوند ده.</p>}
      <div className="grid gap-3 md:grid-cols-2">
        {rows.map((r) => {
          const s = statsFor(r);
          const name = r.member_id ? r.company_members?.name ?? "عضو في الفريق" : staffName(r.staff_user_id);
          return (
            <div key={r.id} className="rounded-2xl border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-secondary"><UserRound className="size-5 text-teal" /></span>
                  <div className="min-w-0"><p className="truncate font-bold text-primary">{name}</p><p className="text-xs text-muted-foreground">متعين من {formatDate(r.created_at)}</p></div>
                </div>
                {canStaff ? (
                  <div className="flex gap-1">
                    <select aria-label="الدور" className={`${inputCls} h-9 w-auto text-xs`} value={r.role} onChange={async (e) => { const { error } = await supabase.from("compound_members").update({ role: e.target.value }).eq("id", r.id); if (error) toast.error(error.message); else q.refetch(); }}>
                      <option value="sales">مبيعات</option><option value="manager">مدير كمبوند</option>
                    </select>
                    <button aria-label="شيل من الفريق" onClick={async () => { if (!confirm(`شيل ${name} من فريق الكمبوند؟`)) return; const { error } = await supabase.from("compound_members").delete().eq("id", r.id); if (error) toast.error(error.message); else q.refetch(); }} className="grid size-9 place-items-center rounded-lg border text-destructive hover:bg-destructive/10"><Trash2 className="size-4" /></button>
                  </div>
                ) : <span className="rounded-full bg-teal-soft px-2.5 py-0.5 text-[11px] font-bold text-primary">{COMPOUND_ROLE_LABEL[r.role]}</span>}
              </div>
              <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                {[["الطلبات", s.total], ["بيتابعها", s.open], ["مبيعات", s.sold]].map(([l, v]) => (
                  <div key={l as string} className="rounded-xl bg-secondary p-2"><p className="font-extrabold text-primary">{formatPrice(v as number)}</p><p className="text-[11px] font-bold text-muted-foreground">{l}</p></div>
                ))}
                <div className="rounded-xl bg-secondary p-2"><p className="text-xs font-extrabold text-primary">{s.last ? formatDate(s.last) : "—"}</p><p className="text-[11px] font-bold text-muted-foreground">آخر تحديث</p></div>
              </div>
            </div>
          );
        })}
      </div>
      {!canStaff && <p className="text-xs text-muted-foreground">التعيين على الكمبوند بيعمله صاحب الحساب أو مدير الشركة.</p>}
    </div>
  );
}
