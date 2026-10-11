import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { DashShell } from "@/components/dash/DashShell";
import { Field, inputCls, btnPrimary } from "@/components/site/ui";
import { AREAS } from "@/components/site/data";
import { logAuthEvent } from "@/components/auth/PhoneOtp";

export const Route = createFileRoute("/_authenticated/join")({
  head: () => ({ meta: [{ title: "طلب الانضمام | فاليو عقار" }, { name: "robots", content: "noindex" }] }),
  component: JoinPage,
});

type AccountType = "individual" | "owner" | "company" | "developer";

function JoinPage() {
  const { user } = Route.useRouteContext();
  const nav = useNavigate();
  const [f, setF] = useState({ name: "", specialty: "", email: user.email ?? "", areas: [] as string[], account_type: "individual" as AccountType, contact_person: "", commercial_register: "", address: "" });
  const isCompany = f.account_type === "company" || f.account_type === "developer";
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (f.name.trim().length < 2) { toast.error("اكتب اسمك أو اسم المكتب"); return; }
    if (isCompany && f.contact_person.trim().length < 2) { toast.error("اكتب اسم المسؤول عن الشركة"); return; }
    setBusy(true);
    const phone = user.phone ? `+${user.phone}` : null;
    const { error } = await supabase.from("brokers").insert({
      user_id: user.id, slug: `b-${crypto.randomUUID().slice(0, 8)}`, name: f.name.trim().slice(0, 100),
      specialty: f.specialty.trim().slice(0, 120) || null, email: f.email.trim().slice(0, 255) || null,
      phone, whatsapp: phone, areas: f.areas, is_active: false, account_type: f.account_type,
      ...(isCompany ? { contact_person: f.contact_person.trim().slice(0, 100), commercial_register: f.commercial_register.trim().slice(0, 50) || null, address: f.address.trim().slice(0, 300) || null } : {}),
    });
    setBusy(false);
    if (error) { toast.error(error.code === "23505" ? "لديك طلب انضمام بالفعل" : "تعذّر إرسال الطلب"); return; }
    await logAuthEvent("join_requested");
    nav({ to: "/pending", replace: true });
  }
  return (
    <DashShell title="طلب الانضمام لفاليو عقار">
      <form onSubmit={submit} className="max-w-xl space-y-4 rounded-2xl border bg-card p-5 md:p-6">
        <p className="text-sm text-muted-foreground">املأ بياناتك وسيتم مراجعة طلبك من إدارة المنصة قبل تفعيل حسابك.</p>
        <div>
          <p className="mb-2 text-sm font-bold text-primary">نوع الحساب</p>
          <div className="flex flex-wrap gap-2">
            {([["individual", "وسيط عقاري"], ["owner", "مالك عقار"], ["company", "شركة تسويق / وساطة"], ["developer", "شركة تطوير"]] as const).map(([v, l]) => <button key={v} type="button" onClick={() => setF({ ...f, account_type: v })} className={`h-10 flex-1 whitespace-nowrap rounded-full border px-4 text-sm font-bold ${f.account_type === v ? "border-primary bg-primary text-primary-foreground" : "text-primary"}`}>{l}</button>)}
          </div>
        </div>
        <Field label={isCompany ? "اسم الشركة" : "الاسم أو اسم المكتب"}><input required className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={100} /></Field>
        {isCompany && (
          <>
            <Field label="اسم المسؤول عن الشركة"><input required className={inputCls} value={f.contact_person} onChange={(e) => setF({ ...f, contact_person: e.target.value })} maxLength={100} /></Field>
            <Field label="رقم السجل التجاري (اختياري)"><input className={inputCls} dir="ltr" value={f.commercial_register} onChange={(e) => setF({ ...f, commercial_register: e.target.value })} maxLength={50} /></Field>
            <Field label="عنوان الشركة (اختياري)"><input className={inputCls} value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} maxLength={300} /></Field>
            <p className="rounded-xl bg-teal-soft p-3 text-xs font-semibold text-primary">بعد موافقة الإدارة تقدر تضيف فريقك (مديرين وموظفين وبروكرات) من لوحة الشركة.</p>
          </>
        )}
        <Field label="التخصص"><input className={inputCls} value={f.specialty} onChange={(e) => setF({ ...f, specialty: e.target.value })} maxLength={120} /></Field>
        <Field label="البريد الإلكتروني (اختياري)"><input type="email" dir="ltr" className={inputCls} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <div>
          <p className="mb-2 text-sm font-bold text-primary">مناطق العمل</p>
          <div className="flex flex-wrap gap-2">
            {AREAS.map((a) => { const on = f.areas.includes(a); return <button key={a} type="button" onClick={() => setF({ ...f, areas: on ? f.areas.filter((x) => x !== a) : [...f.areas, a] })} className={`h-10 rounded-full border px-4 text-sm font-bold ${on ? "border-primary bg-primary text-primary-foreground" : "text-primary hover:border-teal"}`}>{a}</button>; })}
          </div>
        </div>
        <button disabled={busy} className={`${btnPrimary} w-full`}>{busy ? "..." : "إرسال الطلب"}</button>
      </form>
    </DashShell>
  );
}
