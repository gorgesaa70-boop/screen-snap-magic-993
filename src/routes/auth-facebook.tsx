import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/site/Navbar";
import { btnPrimary } from "@/components/site/ui";
import { t, useLang } from "@/lib/i18n";
import type { FinishError } from "@/lib/facebook-auth";

export const Route = createFileRoute("/auth-facebook")({
  head: () => ({ meta: [{ title: "الدخول بحساب Facebook | فاليو عقار" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: FacebookFinish,
});

const ERRORS: Record<FinishError | "expired", string> = {
  cancelled: "لغيت الدخول بحساب Facebook.",
  state: "انتهت مهلة الدخول، جرّب تاني.",
  not_configured: "الدخول بحساب Facebook مش متاح دلوقتي، ادخل بالواتساب.",
  facebook: "Facebook مارجّعش بياناتك، جرّب تاني.",
  banned: "هذا الحساب موقوف ولا يمكنه الدخول، تواصل مع الإدارة",
  server: "حصلت مشكلة، جرّب تاني.",
  expired: "انتهت مهلة الدخول، جرّب تاني.",
};

/**
 * Back from Facebook: the callback put a one-time sign-in token in the URL fragment. Using it signs the person in;
 * the root's sign-in return (useSocialReturn) then sends them to their dashboard or «كمّل بياناتك».
 */
function FacebookFinish() {
  useLang();
  const [error, setError] = useState<keyof typeof ERRORS | null>(null);
  const started = useRef(false);
  useEffect(() => {
    // Once only: the token is single-use, and the fragment is cleared right away.
    if (started.current) return;
    started.current = true;
    const p = new URLSearchParams(window.location.hash.slice(1));
    history.replaceState(null, "", window.location.pathname);
    const th = p.get("th");
    const e = p.get("error");
    if (!th) { setError(e && e in ERRORS ? (e as FinishError) : "server"); return; }
    void supabase.auth.verifyOtp({ token_hash: th, type: "magiclink" }).then(({ error: err }) => { if (err) setError("expired"); });
  }, []);
  return (
    <main className="grid min-h-screen place-items-center bg-background px-4">
      <div className="w-full max-w-sm rounded-2xl border bg-card p-6 text-center">
        <div className="mb-4 flex justify-center"><Logo /></div>
        {error ? (
          <>
            <p className="text-sm font-bold text-primary">{t(ERRORS[error])}</p>
            <Link to="/auth" className={`${btnPrimary} mt-5 inline-flex w-full justify-center`}>{t("الرجوع لتسجيل الدخول")}</Link>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{t("بندخّلك بحساب Facebook…")}</p>
        )}
      </div>
    </main>
  );
}
