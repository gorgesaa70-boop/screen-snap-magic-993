import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/site/Navbar";
import { Field, inputCls, btnPrimary } from "@/components/site/ui";
import { PhoneOtp, destinationFor } from "@/components/auth/PhoneOtp";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "دخول الوسطاء | فاليو عقار" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "description", content: "تسجيل دخول الوسطاء والإدارة إلى لوحة تحكم فاليو عقار." },
      { property: "og:title", content: "دخول الوسطاء | فاليو عقار" },
      { property: "og:description", content: "لوحة تحكم الوسطاء العقاريين على فاليو عقار." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const nav = useNavigate();
  const [method, setMethod] = useState<"phone" | "email">("phone");
  const [mode, setMode] = useState<"login" | "forgot">("login");
  const go = async () => { const { data } = await supabase.auth.getUser(); if (data.user) nav({ to: await destinationFor(data.user.id), replace: true }); };
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      setBusy(false);
      if (error) { toast.error(error.message.includes("banned") ? "تم إيقاف هذا الحساب، تواصل مع الإدارة" : "البريد أو كلمة المرور غير صحيحة"); return; }
      await go();
    } else {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/reset-password` });
      setBusy(false);
      if (error) { toast.error("تعذّر الإرسال، حاول لاحقًا"); return; }
      toast.success("أرسلنا رابط إعادة تعيين كلمة المرور إلى بريدك");
      setMode("login");
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-secondary px-4 py-10">
      <div className="w-full max-w-sm rounded-3xl border bg-card p-6 shadow-card md:p-8">
        <Logo />
        <h1 className="mt-6 text-xl font-extrabold text-primary">تسجيل الدخول</h1>
        <p className="mt-1 text-sm text-muted-foreground">للوسطاء والإدارة. عملاء جدد؟ سجّل برقمك وقدّم طلب انضمام.</p>
        <div className="mt-5 grid grid-cols-2 gap-1 rounded-xl bg-secondary p-1">
          {([["phone", "رقم الهاتف"], ["email", "البريد الإلكتروني"]] as const).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setMethod(k)} className={`h-10 rounded-lg text-sm font-bold transition ${method === k ? "bg-card text-primary shadow-card" : "text-foreground/70"}`}>{l}</button>
          ))}
        </div>
        <div className="mt-5">
          {method === "phone" ? <PhoneOtp mode="login" onVerified={go} /> : (
            <>
              <form onSubmit={submit} className="space-y-4">
                <Field label="البريد الإلكتروني"><input type="email" dir="ltr" required className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></Field>
                {mode === "login" && <Field label="كلمة المرور"><input type="password" dir="ltr" required className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></Field>}
                <button disabled={busy} className={`${btnPrimary} w-full`}>{busy ? "..." : mode === "login" ? "تسجيل الدخول" : "إرسال رابط إعادة التعيين"}</button>
              </form>
              <button onClick={() => setMode(mode === "login" ? "forgot" : "login")} className="mt-4 text-sm font-bold text-primary hover:text-teal">
                {mode === "login" ? "نسيت كلمة المرور؟" : "رجوع لتسجيل الدخول"}
              </button>
            </>
          )}
        </div>
        <AdminBootstrap />
      </div>
    </div>
  );
}

/** First-run only: lets the platform owner create the first admin account. */
function AdminBootstrap() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) { toast.error("كلمة المرور 8 أحرف على الأقل"); return; }
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: `${window.location.origin}/dashboard` } });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(data.session ? "تم إنشاء الحساب" : "تحقق من بريدك لتأكيد الحساب، ثم سجّل الدخول وفعّل صلاحية المدير من لوحة التحكم");
  }
  return (
    <div className="mt-6 border-t pt-4">
      <button onClick={() => setOpen(!open)} className="text-xs font-semibold text-muted-foreground hover:text-primary">إعداد حساب المدير لأول مرة</button>
      {open && (
        <form onSubmit={submit} className="mt-3 space-y-2.5">
          <p className="text-xs text-muted-foreground">يتاح فقط قبل إنشاء أول مدير. بعد التأكيد، سجّل الدخول واضغط «تفعيل صلاحية المدير».</p>
          <input type="email" dir="ltr" required placeholder="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} />
          <input type="password" dir="ltr" required placeholder="password" className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)} />
          <button disabled={busy} className={`${btnPrimary} w-full`}>إنشاء الحساب</button>
        </form>
      )}
    </div>
  );
}
