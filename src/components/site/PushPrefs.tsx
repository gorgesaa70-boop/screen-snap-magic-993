import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BellRing, Share, Smartphone } from "lucide-react";
import { t, useLang } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { useSessionUser } from "@/hooks/useAuth";
import { NOTIF_TYPES } from "@/hooks/useNotifications";
import { currentSubscription, disablePush, enablePush, pushSupport, type PushSupport } from "@/lib/push-client";

/** Whether this browser can get push and whether it is on here (checked after mount: browser-only APIs). */
export function usePushState() {
  const [support, setSupport] = useState<PushSupport | null>(null);
  const [on, setOn] = useState(false);
  const refresh = async () => {
    const s = await pushSupport();
    setSupport(s);
    setOn(s === "ok" ? !!(await currentSubscription().catch(() => null)) && Notification.permission === "granted" : false);
  };
  useEffect(() => { void refresh(); }, []);
  return { support, on, refresh };
}

/** «Notifications on this device» card: turn on/off for this browser, and pick which kinds reach the devices. */
export function PushPrefs() {
  const { user } = useSessionUser();
  const { support, on, refresh } = usePushState();
  const [busy, setBusy] = useState(false);
  const [types, setTypes] = useState<string[] | null>(null);
  useEffect(() => {
    if (!user) return;
    void supabase.from("notification_preferences").select("push_types").eq("user_id", user.id).maybeSingle()
      .then(({ data }) => setTypes(data?.push_types ?? null));
  }, [user]);

  async function toggle() {
    setBusy(true);
    try {
      if (on) { await disablePush(); toast.success("الإشعارات اتقفلت على الجهاز ده"); }
      else { await enablePush(); toast.success("تمام، الإشعارات هتوصلك على الجهاز ده حتى والموقع مقفول"); }
    } catch (e) {
      const m = e instanceof Error ? e.message : "";
      toast.error(m === "denied" ? "الإشعارات مرفوضة من المتصفح. افتح إعدادات الموقع وخلّيها «سماح»."
        : m === "dismissed" ? "محتاج توافق على الإشعارات من رسالة المتصفح."
        : m === "not-ready" ? "الإشعارات لسه بتتجهز، جرّب كمان شوية."
        : "ماقدرناش نفعّل الإشعارات، جرّب تاني.");
    } finally {
      setBusy(false);
      await refresh();
    }
  }

  async function saveTypes(next: string[] | null) {
    if (!user) return;
    setTypes(next);
    const { error } = await supabase.from("notification_preferences").upsert({ user_id: user.id, push_types: next });
    if (error) toast.error("ماتحفظش، جرّب تاني");
  }

  if (!user || support === null) return null;
  const all = Object.keys(NOTIF_TYPES);
  const chosen = types ?? all;

  return (
    <section id="push" className="mb-4 scroll-mt-24 rounded-2xl border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <BellRing className="mt-0.5 size-5 shrink-0 text-teal" />
          <div>
            <p className="font-bold text-primary">إشعارات على الجهاز ده</p>
            <p className="text-xs text-muted-foreground">الإشعار بيوصلك على الموبايل أو الكمبيوتر حتى والموقع مقفول، زي أي تطبيق.</p>
          </div>
        </div>
        {support === "ok" && (
          <button type="button" disabled={busy} onClick={toggle} aria-pressed={on}
            className={`h-10 shrink-0 rounded-full px-5 text-sm font-bold transition disabled:opacity-60 ${on ? "border text-primary hover:bg-secondary" : "bg-primary text-primary-foreground hover:bg-navy-deep"}`}>
            {busy ? "لحظة…" : on ? "إيقاف على الجهاز ده" : "تفعيل الإشعارات"}
          </button>
        )}
      </div>

      {support === "ios-home-screen" && (
        <div className="mt-3 rounded-xl bg-secondary/70 p-3 text-sm text-foreground/80">
          <p className="font-bold text-primary">على الآيفون محتاج خطوة واحدة الأول:</p>
          <ol className="mt-1 list-decimal space-y-1 ps-5">
            <li>دوس على زرار المشاركة <Share className="inline size-4 align-text-bottom" /> تحت في Safari.</li>
            <li>اختار «إضافة إلى الشاشة الرئيسية».</li>
            <li>افتح فاليو عقار من الأيقونة الجديدة، وارجع هنا فعّل الإشعارات.</li>
          </ol>
        </div>
      )}
      {support === "native-app" && (
        <p className="mt-3 flex items-center gap-1.5 rounded-xl bg-secondary/70 p-3 text-sm text-foreground/80">
          <Smartphone className="size-4 shrink-0" />إشعارات التطبيق هتشتغل مع تحديث التطبيق الجاي على المتجر.
        </p>
      )}
      {support === "denied" && <p className="mt-3 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">الإشعارات مقفولة للموقع ده من إعدادات المتصفح. افتح إعدادات الموقع (جنب العنوان فوق) وخلّي الإشعارات «سماح»، وبعدها ارجع هنا.</p>}
      {support === "unsupported" && <p className="mt-3 rounded-xl bg-secondary/70 p-3 text-sm text-foreground/80">المتصفح ده مش بيدعم الإشعارات. جرّب Chrome أو Edge أو Firefox.</p>}

      {on && (
        <fieldset className="mt-3 border-t pt-3">
          <legend className="mb-2 text-xs font-bold text-muted-foreground">يوصلني على أجهزتي:</legend>
          <div className="flex flex-wrap gap-2">
            {all.map((k) => (
              <label key={k} className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold text-primary">
                <input type="checkbox" checked={chosen.includes(k)}
                  onChange={(e) => saveTypes(e.target.checked ? [...new Set([...chosen, k])] : chosen.filter((x) => x !== k))} />
                {NOTIF_TYPES[k]}
              </label>
            ))}
          </div>
        </fieldset>
      )}
    </section>
  );
}

/** Small nudge under the bell list when this device could get push but doesn't yet. */
export function PushNudge() {
  useLang();
  const { user } = useSessionUser();
  const { support, on } = usePushState();
  if (!user || on || !(support === "ok" || support === "ios-home-screen")) return null;
  return (
    <a href="/notifications#push" className="flex items-center justify-center gap-1.5 border-t px-3 py-2.5 text-xs font-bold text-teal hover:bg-secondary">
      <BellRing className="size-4" />{t("فعّل الإشعارات على الجهاز ده")}
    </a>
  );
}
