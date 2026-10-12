import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/site/Navbar";
import { Field, inputCls, btnPrimary } from "@/components/site/ui";
import { PhoneOtp, destinationFor } from "@/components/auth/PhoneOtp";
import { GoogleButton } from "@/components/auth/SocialLogin";
import { AppDownload } from "@/components/site/AppDownload";
import { t, useLang } from "@/lib/i18n";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "تسجيل الدخول | فاليو عقار" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "description", content: "سجّل دخولك على فاليو عقار: العملاء (المفضلة والطلبات)، والوسطاء والشركات (لوحة التحكم)." },
      { property: "og:title", content: "تسجيل الدخول | فاليو عقار" },
      { property: "og:description", content: "لوحة تحكم الوسطاء العقاريين على فاليو عقار." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  useLang();
  const nav = useNavigate();
  const [method, setMethod] = useState<"phone" | "email">("phone");
  const [mode, setMode] = useState<"login" | "signup" | "forgot">("login");
  const [help, setHelp] = useState(false);
  // First-admin setup is a one-time step: shown only at /auth?setup=1 (read after load to match the server render).
  const [setup, setSetup] = useState(false);
  useEffect(() => { setSetup(new URLSearchParams(window.location.search).has("setup")); }, []);
  const go = async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) return;
    const to = await destinationFor(data.user.id);
    if (to === "suspended") { await supabase.auth.signOut(); toast.error("هذا الحساب موقوف ولا يمكنه الدخول، تواصل مع الإدارة"); return; }
    // Back to the page that asked for sign-in (favourite / alert), when it is a path on this site.
    const next = new URLSearchParams(window.location.search).get("next");
    if (next && /^\/(?![/\\])/.test(next) && to !== "/admin") { window.location.replace(next); return; }
    nav({ to, replace: true });
  };
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);
  // After sign-up: waiting for the confirmation e-mail (or the login said the e-mail isn't confirmed yet).
  const [sentTo, setSentTo] = useState<string | null>(null);

  // Coming back from the confirmation link: the session arrives in the URL; send the user on, or explain an expired link.
  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const err = hash.get("error_description");
    if (err) { setMethod("email"); toast.error(/expired|invalid/i.test(err) ? t("رابط التأكيد انتهى أو اتستخدم قبل كده — ادخل بإيميلك وكلمة السر، ولو طلب تأكيد اطلب رابط جديد") : err); return; }
    if (!new URLSearchParams(window.location.search).has("confirmed")) return;
    setMethod("email");
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === "SIGNED_IN" || event === "INITIAL_SESSION")) { toast.success(t("تم تأكيد الإيميل ✓")); void go(); }
    });
    return () => data.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function resend(to: string) {
    setBusy(true);
    const { error } = await supabase.auth.resend({ type: "signup", email: to, options: { emailRedirectTo: `${window.location.origin}/auth?confirmed=1` } });
    setBusy(false);
    if (error) toast.error(/rate|seconds/i.test(error.message) ? t("استنى دقيقة وجرّب تاني") : t("تعذّر الإرسال، حاول لاحقًا"));
    else toast.success(t("بعتنا رابط تأكيد جديد"));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      setBusy(false);
      if (error) {
        if (/not confirmed/i.test(error.message)) { setSentTo(email.trim()); toast.error(t("لازم تأكّد إيميلك الأول — افتح رسالة التأكيد")); return; }
        toast.error(error.message.includes("banned") ? t("تم إيقاف هذا الحساب، تواصل مع الإدارة") : t("الإيميل أو كلمة السر غلط. أول مرة؟ اختار «حساب جديد»"));
        return;
      }
      await go();
    } else if (mode === "signup") {
      const name = fullName.trim();
      if (name.length < 2) { setBusy(false); toast.error(t("اكتب اسمك")); return; }
      if (password.length < 8) { setBusy(false); toast.error(t("كلمة السر لازم 8 حروف أو أرقام على الأقل")); return; }
      if (password !== password2) { setBusy(false); toast.error(t("كلمتين السر مش زي بعض")); return; }
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(), password,
        options: { emailRedirectTo: `${window.location.origin}/auth?confirmed=1`, data: { full_name: name.slice(0, 100) } },
      });
      setBusy(false);
      if (error) {
        if (/already registered|already exists/i.test(error.message)) { toast.error(t("الإيميل ده عليه حساب — ادخل بكلمة السر، أو اختار «نسيت كلمة المرور»")); setMode("login"); return; }
        if (/rate|seconds/i.test(error.message)) { toast.error(t("محاولات كتير — استنى شوية وجرّب تاني")); return; }
        if (/password/i.test(error.message)) { toast.error(t("كلمة السر ضعيفة — خليها أطول وفيها حروف وأرقام")); return; }
        if (/invalid/i.test(error.message)) { toast.error(t("الإيميل ده مش صحيح")); return; }
        toast.error(t("تعذّر إنشاء الحساب، حاول لاحقًا")); return;
      }
      // Existing confirmed e-mail: the API answers without an identity (it doesn't reveal accounts).
      if (data.user && (data.user.identities?.length ?? 0) === 0) { toast.error(t("الإيميل ده عليه حساب — ادخل بكلمة السر، أو اختار «نسيت كلمة المرور»")); setMode("login"); return; }
      if (data.session) { toast.success(t("اتعمل حسابك ✓")); await go(); return; }
      setSentTo(email.trim());
    } else {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/reset-password` });
      setBusy(false);
      if (error) { toast.error("تعذّر الإرسال، حاول لاحقًا"); return; }
      toast.success("أرسلنا رابط إعادة تعيين كلمة المرور إلى بريدك");
      setMode("login");
    }
  }

  return (
    <div className="min-h-screen bg-secondary px-4 py-8 md:py-12">
      <div className="mx-auto grid w-full max-w-5xl items-start gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
      <div className="w-full rounded-3xl border bg-card p-6 shadow-card md:p-8">
        <div className="flex items-center justify-between gap-3">
          <Logo />
          <a href="/" className="text-xs font-bold text-muted-foreground hover:text-primary">{t("الرجوع للموقع")}</a>
        </div>
        <h1 className="mt-6 text-2xl font-extrabold text-primary">{t("تسجيل الدخول")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("ادخل برقم موبايلك — للعملاء والوسطاء والشركات. أول مرة؟ هيتعملك حساب على طول.")}</p>
        <div className="mt-5">
          <GoogleButton onSignedIn={go} />
          <div className="my-4 flex items-center gap-3 text-xs font-semibold text-muted-foreground"><span className="h-px flex-1 bg-border" />{t("أو")}<span className="h-px flex-1 bg-border" /></div>
        </div>
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-secondary p-1">
          {([["phone", "رقم الهاتف"], ["email", "البريد الإلكتروني"]] as const).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setMethod(k)} className={`h-10 rounded-lg text-sm font-bold transition ${method === k ? "bg-card text-primary shadow-card" : "text-foreground/70"}`}>{t(l)}</button>
          ))}
        </div>
        <div className="mt-5">
          {method === "phone" ? (
            <>
              <PhoneOtp mode="login" onVerified={go} />
              <button type="button" onClick={() => setHelp(!help)} className="mt-4 text-sm font-bold text-primary hover:text-teal">{t("نسيت رقم الهاتف أو تم تغييره؟")}</button>
              {help && (
                <div className="mt-2 space-y-1.5 rounded-xl bg-secondary p-3 text-xs leading-6 text-foreground/80">
                  <p>{t("1. سجّل الدخول بالبريد الإلكتروني المسجّل في حسابك (أو أعد تعيين كلمة المرور منه).")}</p>
                  <p>{t("2. من صفحة «حسابي» أضف الرقم الجديد وأكّده برمز يصل إليه.")}</p>
                  <p>{t("إذا لم يكن لديك بريد مسجّل، تتحقق الإدارة من هويتك وملكية الحساب قبل أي تعديل، ثم يجب تأكيد الرقم الجديد برمز تحقق. التواصل وحده لا يكفي لنقل الحساب.")}</p>
                </div>
              )}
            </>
          ) : (
            <>
              {sentTo ? (
                <div className="space-y-3 rounded-2xl bg-teal-soft p-4 text-sm text-primary">
                  <p className="font-extrabold">{t("بعتنا لك إيميل تأكيد ✉️")}</p>
                  <p>{t("افتح الرسالة اللي وصلت على")} <b dir="ltr">{sentTo}</b> {t("واضغط على رابط التأكيد، وهتدخل على طول.")}</p>
                  <p className="text-xs text-foreground/70">{t("مش لاقيها؟ شوف الـ Spam أو الرسائل غير المرغوب فيها، واستنى دقيقتين.")}</p>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" disabled={busy} onClick={() => resend(sentTo)} className="inline-flex h-10 items-center rounded-xl border border-primary px-4 text-xs font-bold">{t("ابعت الرابط تاني")}</button>
                    <button type="button" onClick={() => { setSentTo(null); setMode("login"); }} className="inline-flex h-10 items-center rounded-xl px-4 text-xs font-bold text-muted-foreground hover:text-primary">{t("أكّدت — ادخل")}</button>
                  </div>
                </div>
              ) : (
                <>
                  {mode !== "forgot" && (
                    <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl border p-1">
                      {([["login", "عندي حساب"], ["signup", "حساب جديد"]] as const).map(([k, l]) => (
                        <button key={k} type="button" onClick={() => setMode(k)} className={`h-9 rounded-lg text-sm font-bold transition ${mode === k ? "bg-primary text-primary-foreground" : "text-primary"}`}>{t(l)}</button>
                      ))}
                    </div>
                  )}
                  <form onSubmit={submit} className="space-y-4">
                    {mode === "signup" && <Field label={t("الاسم")}><input required className={inputCls} value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={100} autoComplete="name" /></Field>}
                    <Field label={t("البريد الإلكتروني")}><input type="email" dir="ltr" required className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></Field>
                    {mode !== "forgot" && <Field label={mode === "signup" ? t("كلمة السر (8 حروف أو أرقام على الأقل)") : t("كلمة المرور")}><input type="password" dir="ltr" required minLength={mode === "signup" ? 8 : undefined} className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "signup" ? "new-password" : "current-password"} /></Field>}
                    {mode === "signup" && <Field label={t("اكتب كلمة السر تاني")}><input type="password" dir="ltr" required className={inputCls} value={password2} onChange={(e) => setPassword2(e.target.value)} autoComplete="new-password" /></Field>}
                    <button disabled={busy} className={`${btnPrimary} w-full`}>{busy ? "..." : mode === "login" ? t("تسجيل الدخول") : mode === "signup" ? t("عمل الحساب") : t("إرسال رابط إعادة التعيين")}</button>
                  </form>
                  {mode === "signup" && <p className="mt-3 text-xs text-muted-foreground">{t("هيوصلك إيميل تأكيد. لو عندك رقم موبايل، ضيفه بعدين من «حسابي» عشان تدخل بالاتنين على نفس الحساب.")}</p>}
                  {mode !== "signup" && (
                    <button onClick={() => setMode(mode === "login" ? "forgot" : "login")} className="mt-4 text-sm font-bold text-primary hover:text-teal">
                      {mode === "login" ? t("نسيت كلمة المرور؟") : t("رجوع لتسجيل الدخول")}
                    </button>
                  )}
                </>
              )}
            </>
          )}
        </div>
        {setup && <AdminBootstrap />}
      </div>
      <p className="mx-auto mt-4 max-w-md text-center text-xs text-muted-foreground">
        {t("بالدخول إنت موافق على")} <Link to="/terms" className="font-bold text-primary hover:text-teal">{t("شروط الاستخدام")}</Link> {t("و")}<Link to="/privacy" className="font-bold text-primary hover:text-teal">{t("سياسة الخصوصية")}</Link>.
      </p>
      <AppDownload />
      </div>
    </div>
  );
}

/** First-run only: lets the platform owner create the first admin account. */
function AdminBootstrap() {
  useLang();
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
      <button onClick={() => setOpen(!open)} className="text-xs font-semibold text-muted-foreground hover:text-primary">{t("إعداد حساب المدير لأول مرة")}</button>
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
