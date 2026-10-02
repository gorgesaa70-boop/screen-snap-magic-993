import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/site/Navbar";
import { Field, inputCls, btnPrimary } from "@/components/site/ui";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "تعيين كلمة المرور | فاليو عقار" },
      { name: "description", content: "تعيين كلمة مرور جديدة لحساب الوسيط على فاليو عقار." },
      { property: "og:title", content: "تعيين كلمة المرور | فاليو عقار" },
      { property: "og:description", content: "تعيين كلمة مرور حساب فاليو عقار." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPage,
});

function ResetPage() {
  const nav = useNavigate();
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pw.length < 8) { toast.error("كلمة المرور 8 أحرف على الأقل"); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) { toast.error("انتهت صلاحية الرابط، اطلب رابطًا جديدًا"); return; }
    toast.success("تم حفظ كلمة المرور");
    nav({ to: "/dashboard" });
  }
  return (
    <div className="grid min-h-screen place-items-center bg-secondary px-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-3xl border bg-card p-6 shadow-card md:p-8">
        <Logo />
        <h1 className="text-xl font-extrabold text-primary">تعيين كلمة مرور جديدة</h1>
        <Field label="كلمة المرور الجديدة"><input type="password" dir="ltr" className={inputCls} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" /></Field>
        <button disabled={busy} className={`${btnPrimary} w-full`}>حفظ</button>
      </form>
    </div>
  );
}
