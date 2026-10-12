import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { t, useLang } from "@/lib/i18n";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/site/Navbar";
import { Field, inputCls, btnPrimary } from "@/components/site/ui";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "تعيين كلمة المرور | فاليو عقار" },
      { name: "robots", content: "noindex, nofollow" },
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
  useLang();
  const nav = useNavigate();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  // The e-mail link signs the user in (recovery session). Without it there is nothing to update.
  const [state, setState] = useState<"checking" | "ready" | "no-link">("checking");
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) setState("ready");
    });
    const t0 = setTimeout(() => {
      void supabase.auth.getSession().then(({ data: d }) => setState((s) => (s === "ready" ? s : d.session ? "ready" : "no-link")));
    }, 1500);
    return () => { data.subscription.unsubscribe(); clearTimeout(t0); };
  }, []);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pw.length < 8) { toast.error(t("كلمة السر لازم 8 حروف أو أرقام على الأقل")); return; }
    if (pw !== pw2) { toast.error(t("كلمتين السر مش زي بعض")); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) { toast.error(t("انتهت صلاحية الرابط، اطلب رابطًا جديدًا")); setState("no-link"); return; }
    toast.success(t("تم حفظ كلمة المرور"));
    nav({ to: "/dashboard" });
  }
  return (
    <div className="grid min-h-screen place-items-center bg-secondary px-4">
      <div className="w-full max-w-sm space-y-4 rounded-3xl border bg-card p-6 shadow-card md:p-8">
        <Logo />
        <h1 className="text-xl font-extrabold text-primary">{t("تعيين كلمة مرور جديدة")}</h1>
        {state === "checking" && <div className="h-24 animate-pulse rounded-xl bg-muted" />}
        {state === "no-link" && (
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">{t("الصفحة دي بتشتغل من الرابط اللي بيوصلك على الإيميل. الرابط ده مش موجود أو انتهى — اطلب رابط جديد.")}</p>
            <a href="/auth" className={`${btnPrimary} w-full`}>{t("اطلب رابط جديد")}</a>
          </div>
        )}
        {state === "ready" && (
          <form onSubmit={submit} className="space-y-4">
            <Field label={t("كلمة السر الجديدة (8 حروف أو أرقام على الأقل)")}><input type="password" dir="ltr" required minLength={8} className={inputCls} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" /></Field>
            <Field label={t("اكتب كلمة السر تاني")}><input type="password" dir="ltr" required className={inputCls} value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" /></Field>
            <button disabled={busy} className={`${btnPrimary} w-full`}>{busy ? "..." : t("حفظ")}</button>
          </form>
        )}
      </div>
    </div>
  );
}
