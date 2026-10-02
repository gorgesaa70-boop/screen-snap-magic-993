import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { DashShell } from "@/components/dash/DashShell";
import { Field, inputCls, btnPrimary } from "@/components/site/ui";
import { AREAS } from "@/components/site/data";
import { logAuthEvent } from "@/components/auth/PhoneOtp";

export const Route = createFileRoute("/_authenticated/join")({
  head: () => ({ meta: [{ title: "طلب الانضمام كوسيط | فاليو عقار" }, { name: "robots", content: "noindex" }] }),
  component: JoinPage,
});

function JoinPage() {
  const { user } = Route.useRouteContext();
  const nav = useNavigate();
  const [f, setF] = useState({ name: "", specialty: "", email: user.email ?? "", areas: [] as string[] });
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (f.name.trim().length < 2) { toast.error("اكتب اسمك أو اسم المكتب"); return; }
    setBusy(true);
    const phone = user.phone ? `+${user.phone}` : null;
    const { error } = await supabase.from("brokers").insert({
      user_id: user.id, slug: `b-${crypto.randomUUID().slice(0, 8)}`, name: f.name.trim().slice(0, 100),
      specialty: f.specialty.trim().slice(0, 120) || null, email: f.email.trim().slice(0, 255) || null,
      phone, whatsapp: phone, areas: f.areas, is_active: false,
    });
    setBusy(false);
    if (error) { toast.error(error.code === "23505" ? "لديك طلب انضمام بالفعل" : "تعذّر إرسال الطلب"); return; }
    await logAuthEvent("join_requested");
    nav({ to: "/pending", replace: true });
  }
  return (
    <DashShell title="طلب الانضمام كوسيط عقاري">
      <form onSubmit={submit} className="max-w-xl space-y-4 rounded-2xl border bg-card p-5 md:p-6">
        <p className="text-sm text-muted-foreground">املأ بياناتك وسيتم مراجعة طلبك من إدارة المنصة قبل تفعيل حسابك.</p>
        <Field label="الاسم أو اسم المكتب"><input required className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={100} /></Field>
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
