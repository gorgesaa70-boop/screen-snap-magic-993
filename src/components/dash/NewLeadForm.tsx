import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { LEAD_SOURCES, leadNo, type BrokerRow } from "@/components/site/data";
import { Field, inputCls, btnPrimary } from "@/components/site/ui";
import { normalizePhone } from "@/lib/broker-login";

/** Admins and Value Aqar staff record leads from calls, ads, walk-ins, referrals… with their real source. */
export function NewLeadForm({ brokers, onDone }: { brokers: BrokerRow[]; onDone: () => void }) {
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const blank = { name: "", phone: "", source: "phone_call", source_note: "", property_type: "", area: "", budget: "", details: "", assigned_broker_id: "" };
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (f.name.trim().length < 2 || !/^[0-9+\s]{8,20}$/.test(f.phone.trim())) { toast.error("اكتب الاسم ورقم هاتف صحيح"); return; }
    setBusy(true);
    const norm = normalizePhone(f.phone);
    const { data: dup } = norm ? await supabase.from("leads").select("lead_no").eq("phone_norm", norm).limit(1) : { data: [] };
    const { data, error } = await supabase.from("leads").insert({
      name: f.name.trim().slice(0, 100), phone: f.phone.trim(), kind: "request",
      source: f.source, source_note: f.source_note.trim().slice(0, 200) || null,
      property_type: f.property_type.trim() || null, area: f.area.trim() || null, budget: f.budget ? Number(f.budget) : null,
      details: f.details.trim().slice(0, 1000) || null, assigned_broker_id: f.assigned_broker_id || null,
    }).select("id, lead_no").single();
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`تم تسجيل العميل ${leadNo(data.lead_no)}${dup?.length ? " — تنبيه: الرقم ده متسجّل قبل كده" : ""}`);
    setF(blank); setOpen(false); onDone();
    nav({ to: "/leads/$id", params: { id: data.id } });
  }

  if (!open) return <button onClick={() => setOpen(true)} className={btnPrimary}><Plus className="size-4" />إضافة عميل</button>;
  return (
    <form onSubmit={submit} className="grid gap-3 rounded-2xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-3">
      <Field label="الاسم"><input className={inputCls} value={f.name} onChange={set("name")} maxLength={100} /></Field>
      <Field label="رقم الهاتف"><input className={inputCls} dir="ltr" inputMode="tel" value={f.phone} onChange={set("phone")} maxLength={20} /></Field>
      <Field label="المصدر"><select className={inputCls} value={f.source} onChange={set("source")}>{Object.entries(LEAD_SOURCES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
      <Field label="تفاصيل المصدر (اسم الحملة / المُرشِّح)"><input className={inputCls} value={f.source_note} onChange={set("source_note")} maxLength={200} /></Field>
      <Field label="نوع العقار المطلوب"><input className={inputCls} value={f.property_type} onChange={set("property_type")} maxLength={60} /></Field>
      <Field label="المنطقة"><input className={inputCls} value={f.area} onChange={set("area")} maxLength={60} /></Field>
      <Field label="الميزانية (ج.م)"><input className={inputCls} inputMode="numeric" value={f.budget} onChange={(e) => setF({ ...f, budget: e.target.value.replace(/\D/g, "") })} /></Field>
      <Field label="إسناد لشركة / وسيط"><select className={inputCls} value={f.assigned_broker_id} onChange={set("assigned_broker_id")}><option value="">غير مُسند</option>{brokers.filter((b) => b.is_active).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
      <div className="sm:col-span-2 lg:col-span-3"><Field label="تفاصيل الطلب"><textarea className={`${inputCls} h-20 py-2`} value={f.details} onChange={set("details")} maxLength={1000} /></Field></div>
      <div className="flex gap-2 sm:col-span-2 lg:col-span-3">
        <button disabled={busy} className={btnPrimary}>{busy ? "..." : "حفظ العميل"}</button>
        <button type="button" onClick={() => setOpen(false)} className="h-11 px-4 text-sm font-bold text-muted-foreground hover:text-primary">إلغاء</button>
      </div>
    </form>
  );
}
