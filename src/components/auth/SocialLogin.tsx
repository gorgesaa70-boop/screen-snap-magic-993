import { useEffect, useState } from "react";
import { toast } from "sonner";
import { lovable } from "@/integrations/lovable";
import { supabase } from "@/integrations/supabase/client";
import { destinationFor } from "@/components/auth/PhoneOtp";
import { t, useLang } from "@/lib/i18n";

// Set before leaving for Google so the returning page knows to route the user to their dashboard.
const RETURN_FLAG = "va-oauth-return";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className="size-5 shrink-0">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

/**
 * "Continue with Google" through Lovable Cloud's managed OAuth (works on the published site).
 * Hidden inside the native app: Google refuses sign-in from embedded app web views.
 */
export function GoogleButton({ onSignedIn }: { onSignedIn: () => void }) {
  useLang();
  const [busy, setBusy] = useState(false);
  const [native, setNative] = useState(false);
  useEffect(() => {
    void import("@capacitor/core").then(({ Capacitor }) => setNative(Capacitor.isNativePlatform())).catch(() => {});
  }, []);
  if (native) return null;
  async function go() {
    setBusy(true);
    try { sessionStorage.setItem(RETURN_FLAG, String(Date.now())); } catch { /* storage blocked: user lands on the home page signed in */ }
    const r = await lovable.auth.signInWithOAuth("google");
    if (r.redirected) return;
    setBusy(false);
    try { sessionStorage.removeItem(RETURN_FLAG); } catch { /* ignore */ }
    if (r.error) { toast.error(t("تعذّر الدخول بحساب Google، حاول تاني")); return; }
    onSignedIn();
  }
  return (
    <button type="button" onClick={go} disabled={busy} className="flex h-12 w-full items-center justify-center gap-2.5 rounded-xl border bg-card text-sm font-bold text-foreground transition hover:bg-secondary disabled:opacity-60">
      <GoogleIcon />{busy ? "..." : t("المتابعة بحساب Google")}
    </button>
  );
}

/** After returning from Google: send the user where their account belongs (same rules as phone/email sign-in). */
export function useSocialReturn(navigate: (to: string) => void) {
  useEffect(() => {
    let flagged = false;
    try { flagged = Date.now() - Number(sessionStorage.getItem(RETURN_FLAG) ?? 0) < 10 * 60_000; } catch { /* ignore */ }
    if (!flagged) return;
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session || (event !== "SIGNED_IN" && event !== "INITIAL_SESSION")) return;
      try { sessionStorage.removeItem(RETURN_FLAG); } catch { /* ignore */ }
      void destinationFor(session.user.id).then(async (to) => {
        if (to === "suspended") { await supabase.auth.signOut(); toast.error(t("هذا الحساب موقوف ولا يمكنه الدخول، تواصل مع الإدارة")); return; }
        navigate(to);
      });
    });
    return () => data.subscription.unsubscribe();
  }, [navigate]);
}
