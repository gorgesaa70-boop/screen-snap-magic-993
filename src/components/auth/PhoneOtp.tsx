import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Field, inputCls, btnPrimary } from "@/components/site/ui";
import { useServerFn } from "@tanstack/react-start";
import { t, useLang } from "@/lib/i18n";
import { sendWhatsappOtp, verifyWhatsappOtp, changePhoneWithWhatsapp } from "@/lib/whatsapp-otp.functions";

const WA_ERRORS: Record<string, string> = {
  not_configured: "الدخول عبر واتساب غير مفعّل بعد، استخدم الرسائل النصية أو البريد",
  too_soon: "انتظر قليلًا قبل طلب رمز جديد",
  rate_limited: "تجاوزت عدد مرات الإرسال المسموح، حاول لاحقًا",
  send_failed: "تعذّر إرسال الرسالة عبر واتساب، تأكد أن الرقم مسجّل على واتساب",
  expired: "انتهت صلاحية الرمز، اطلب رمزًا جديدًا",
  locked: "تم إيقاف الرمز بعد محاولات كثيرة، اطلب رمزًا جديدًا",
  banned: "هذا الحساب موقوف ولا يمكنه الدخول، تواصل مع الإدارة",
  conflict: "تعذّر تحديد الحساب المرتبط بهذا الرقم. تم تحويل الطلب لمراجعة الإدارة، أو سجّل الدخول بالبريد الإلكتروني",
  phone_taken: "هذا الرقم مرتبط بحساب آخر ولا يمكن استخدامه",
  wrong: "رمز غير صحيح",
  server: "حدث خطأ، حاول مرة أخرى",
};

export const COUNTRIES = [
  { code: "20", label: "مصر", flag: "🇪🇬", re: /^1[0125]\d{8}$/ },
  { code: "965", label: "الكويت", flag: "🇰🇼", re: /^[2569]\d{7}$/ },
  { code: "966", label: "السعودية", flag: "🇸🇦", re: /^5\d{8}$/ },
  { code: "971", label: "الإمارات", flag: "🇦🇪", re: /^5\d{8}$/ },
  { code: "974", label: "قطر", flag: "🇶🇦", re: /^[3567]\d{7}$/ },
  { code: "973", label: "البحرين", flag: "🇧🇭", re: /^[36]\d{7}$/ },
  { code: "968", label: "عُمان", flag: "🇴🇲", re: /^[79]\d{7}$/ },
  { code: "962", label: "الأردن", flag: "🇯🇴", re: /^7\d{8}$/ },
  { code: "", label: "دولة أخرى", flag: "🌍", re: /^\d{7,15}$/ },
];

const RESEND_SECONDS = 60;
const CODE_TTL_SECONDS = 300;
const MAX_ATTEMPTS = 5;
const MAX_SENDS = 4; // per 30 minutes per number
const SEND_WINDOW_MS = 30 * 60 * 1000;

export const maskPhone = (p: string) => `+${p.slice(0, 3)}****${p.slice(-3)}`;

export async function logAuthEvent(event: string, phone?: string, detail?: string) {
  const { data } = await supabase.auth.getSession();
  await supabase.from("auth_events").insert({
    event, user_id: data.session?.user.id ?? null,
    phone_masked: phone ? maskPhone(phone) : null, detail: detail?.slice(0, 200) ?? null,
  });
}

function normalize(cc: string, raw: string) {
  let n = raw.replace(/\D/g, "");
  if (!cc) return n.replace(/^00/, "");
  if (n.startsWith("00" + cc)) n = n.slice(2 + cc.length);
  else if (n.startsWith(cc) && n.length > 9) n = n.slice(cc.length);
  n = n.replace(/^0+/, "");
  return n;
}

function sendsAllowed(phone: string) {
  const key = `otp-sends:${phone}`;
  const now = Date.now();
  const list: number[] = JSON.parse(localStorage.getItem(key) || "[]").filter((t: number) => now - t < SEND_WINDOW_MS);
  return { ok: list.length < MAX_SENDS, record: () => localStorage.setItem(key, JSON.stringify([...list, now])) };
}

type Props = {
  mode: "login" | "change";
  onVerified: () => void;
};

export function PhoneOtp({ mode, onVerified }: Props) {
  useLang();
  const [cc, setCc] = useState("20");
  const [raw, setRaw] = useState("");
  const [phone, setPhone] = useState(""); // E.164 without +
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [expiresIn, setExpiresIn] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);
  const [channel, setChannel] = useState<"whatsapp" | "sms">("whatsapp");
  const waSend = useServerFn(sendWhatsappOtp);
  const waVerify = useServerFn(verifyWhatsappOtp);
  const waChange = useServerFn(changePhoneWithWhatsapp);

  useEffect(() => {
    if (step !== "code") return;
    const t = setInterval(() => {
      setResendIn((s) => Math.max(0, s - 1));
      setExpiresIn((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(t);
  }, [step]);

  // Web OTP API autofill (Android Chrome) in addition to autocomplete="one-time-code" (iOS)
  useEffect(() => {
    if (step !== "code" || typeof window === "undefined" || !("OTPCredential" in window)) return;
    const ac = new AbortController();
    (navigator.credentials as any).get({ otp: { transport: ["sms"] }, signal: ac.signal })
      .then((c: { code?: string } | null) => { if (c?.code) setCode(c.code.slice(0, 6)); })
      .catch(() => {});
    return () => ac.abort();
  }, [step]);

  async function send(isResend = false) {
    const country = COUNTRIES.find((c) => c.code === cc)!;
    const local = normalize(cc, raw);
    if (!country.re.test(local)) { toast.error("رقم الهاتف غير صحيح لهذه الدولة"); return; }
    const full = cc + local;
    const quota = sendsAllowed(full);
    if (!quota.ok) { toast.error("تجاوزت عدد مرات الإرسال المسموح، حاول بعد 30 دقيقة"); await logAuthEvent("otp_locked", full, "send limit"); return; }
    if (channel === "whatsapp") {
      setBusy(true);
      const r = await waSend({ data: { phone: full } }).catch(() => ({ ok: false as const, error: "server" }));
      setBusy(false);
      if (!r.ok) { toast.error(WA_ERRORS[r.error] ?? WA_ERRORS["server"]); return; }
      quota.record();
      setPhone(full); setStep("code"); setCode(""); setAttempts(0);
      setResendIn(RESEND_SECONDS); setExpiresIn(CODE_TTL_SECONDS);
      toast.success("تم إرسال رمز التحقق عبر واتساب");
      setTimeout(() => codeRef.current?.focus(), 50);
      return;
    }
    setBusy(true);
    const { error } = mode === "login"
      ? await supabase.auth.signInWithOtp({ phone: `+${full}`, options: { shouldCreateUser: true, channel: "sms" } })
      : await supabase.auth.updateUser({ phone: `+${full}` });
    setBusy(false);
    if (error) {
      const msg = /rate|limit|seconds/i.test(error.message) ? "طلبات كثيرة، انتظر قليلًا ثم حاول" : /provider|sms|phone.*(disabled|not enabled)|Unsupported/i.test(error.message) ? "خدمة الرسائل غير مفعّلة بعد، تواصل مع الإدارة" : /already/i.test(error.message) ? "هذا الرقم مسجّل لحساب آخر" : "تعذّر إرسال الرمز، حاول مرة أخرى";
      toast.error(msg);
      await logAuthEvent("otp_failed", full, `send: ${error.message}`);
      return;
    }
    quota.record();
    setPhone(full);
    setStep("code");
    setCode("");
    setAttempts(0);
    setResendIn(RESEND_SECONDS);
    setExpiresIn(CODE_TTL_SECONDS);
    toast.success("تم إرسال رمز التحقق");
    await logAuthEvent(mode === "change" ? "phone_change_requested" : isResend ? "otp_resent" : "otp_requested", full);
    setTimeout(() => codeRef.current?.focus(), 50);
  }

  async function verify(e?: React.FormEvent) {
    e?.preventDefault();
    if (!/^\d{6}$/.test(code)) { toast.error("أدخل الرمز المكوّن من 6 أرقام"); return; }
    if (expiresIn <= 0) { toast.error("انتهت صلاحية الرمز، اطلب رمزًا جديدًا"); return; }
    if (attempts >= MAX_ATTEMPTS) { toast.error("محاولات كثيرة، اطلب رمزًا جديدًا"); return; }
    if (channel === "whatsapp") {
      setBusy(true);
      if (mode === "change") {
        const c = await waChange({ data: { phone, code } }).catch(() => ({ ok: false as const, error: "server" }));
        setBusy(false);
        if (!c.ok) { setCode(""); if ("remaining" in c && typeof c.remaining === "number") { setAttempts(MAX_ATTEMPTS - c.remaining); toast.error(`رمز غير صحيح (متبقٍ ${c.remaining} محاولات)`); } else { if (c.error === "locked" || c.error === "expired") setExpiresIn(0); toast.error(WA_ERRORS[c.error] ?? WA_ERRORS["server"]); } return; }
        onVerified();
        return;
      }
      const r = await waVerify({ data: { phone, code } }).catch(() => ({ ok: false as const, error: "server" }));
      if (!r.ok) {
        setBusy(false); setCode("");
        if ("remaining" in r && typeof r.remaining === "number") { setAttempts(MAX_ATTEMPTS - r.remaining); toast.error(`رمز غير صحيح (متبقٍ ${r.remaining} محاولات)`); }
        else { if (r.error === "locked" || r.error === "expired") setExpiresIn(0); toast.error(WA_ERRORS[r.error] ?? WA_ERRORS["server"]); }
        return;
      }
      const { error: sErr } = await supabase.auth.verifyOtp({ token_hash: r.tokenHash, type: "magiclink" });
      setBusy(false);
      if (sErr) { toast.error(WA_ERRORS["server"]); return; }
      onVerified();
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({ phone: `+${phone}`, token: code, type: mode === "login" ? "sms" : "phone_change" });
    setBusy(false);
    if (error) {
      const n = attempts + 1;
      setAttempts(n);
      setCode("");
      if (n >= MAX_ATTEMPTS) { setExpiresIn(0); await logAuthEvent("otp_locked", phone, "too many attempts"); toast.error("تم إيقاف الرمز بعد محاولات كثيرة، اطلب رمزًا جديدًا"); }
      else { await logAuthEvent("otp_failed", phone, "wrong or expired code"); toast.error(`رمز غير صحيح أو منتهي (متبقٍ ${MAX_ATTEMPTS - n} محاولات)`); }
      return;
    }
    await logAuthEvent(mode === "change" ? "phone_changed" : "otp_verified", phone);
    onVerified();
  }

  useEffect(() => { if (code.length === 6 && step === "code" && !busy) verify(); /* auto-submit on autofill */ }, [code]); // eslint-disable-line react-hooks/exhaustive-deps

  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  if (step === "phone") {
    return (
      <form onSubmit={(e) => { e.preventDefault(); send(); }} className="space-y-4">
        <Field label={mode === "login" ? t("رقم الهاتف") : t("رقم الهاتف الجديد")}>
          <div className="flex gap-2" dir="ltr">
            <div className="w-28 shrink-0"><select aria-label="مفتاح الدولة" value={cc} onChange={(e) => setCc(e.target.value)} className={inputCls}>
              {COUNTRIES.map((c) => <option key={c.label} value={c.code}>{c.flag} {c.code ? `+${c.code}` : "+…"}</option>)}
            </select></div>
            <input type="tel" inputMode="tel" autoComplete="tel-national" required maxLength={18}
              placeholder={cc === "20" ? "10 1234 5678" : cc === "965" ? "5123 4567" : cc ? "" : t("مفتاح الدولة + الرقم")}
              className={`${inputCls.replace("w-full", "")} w-auto min-w-0 flex-1`} value={raw} onChange={(e) => setRaw(e.target.value)} />
          </div>
        </Field>
        {(
          <div role="radiogroup" aria-label="طريقة الإرسال" className="grid grid-cols-2 gap-2">
            {(["whatsapp", "sms"] as const).map((c) => (
              <button key={c} type="button" role="radio" aria-checked={channel === c} onClick={() => setChannel(c)}
                className={`h-11 rounded-xl border text-sm font-bold transition ${channel === c ? "border-teal bg-teal/10 text-primary" : "border-border text-muted-foreground hover:border-teal/50"}`}>
                {c === "whatsapp" ? t("واتساب") : t("رسالة نصية")}
              </button>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground">{t("سنرسل رمز تحقق من 6 أرقام عبر {c}. الرمز صالح لمدة 5 دقائق.", { c: channel === "whatsapp" ? t("واتساب") : t("رسالة نصية") })}</p>
        <button disabled={busy} className={`${btnPrimary} w-full`}>{busy ? t("جارٍ الإرسال...") : t("إرسال رمز التحقق")}</button>
      </form>
    );
  }

  return (
    <form onSubmit={verify} className="space-y-4">
      <p className="text-sm text-foreground/80">{t("أدخل الرمز المرسل إلى")} <span dir="ltr" className="font-bold text-primary">+{phone}</span></p>
      <input ref={codeRef} aria-label="رمز التحقق" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} dir="ltr"
        className={`${inputCls} h-14 text-center text-2xl font-extrabold tracking-[0.6em]`} value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} disabled={busy || attempts >= MAX_ATTEMPTS} />
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{expiresIn > 0 ? `${t("صلاحية الرمز:")} ${mmss(expiresIn)}` : t("انتهت صلاحية الرمز")}</span>
        <span>{t("المحاولات:")} {attempts}/{MAX_ATTEMPTS}</span>
      </div>
      <button disabled={busy || code.length !== 6 || expiresIn <= 0 || attempts >= MAX_ATTEMPTS} className={`${btnPrimary} w-full`}>{busy ? t("جارٍ التحقق...") : t("تأكيد")}</button>
      <div className="flex items-center justify-between text-sm">
        <button type="button" onClick={() => setStep("phone")} className="font-bold text-muted-foreground hover:text-primary">{t("تغيير الرقم")}</button>
        <button type="button" disabled={resendIn > 0 || busy} onClick={() => send(true)} className="font-bold text-primary hover:text-teal disabled:text-muted-foreground">
          {resendIn > 0 ? `${t("إعادة الإرسال بعد")} ${resendIn}` : t("إعادة إرسال الرمز")}
        </button>
      </div>
    </form>
  );
}

/** Decide where a signed-in user should land based on their roles and broker status. */
export async function destinationFor(userId: string): Promise<"/admin" | "/dashboard" | "/pending" | "/join" | "suspended"> {
  const [roles, broker] = await Promise.all([
    supabase.from("user_roles").select("role").eq("user_id", userId),
    supabase.from("brokers").select("is_active, suspended_at").eq("user_id", userId).maybeSingle(),
  ]);
  const list = (roles.data ?? []).map((r) => r.role);
  if (list.includes("admin")) return "/admin";
  if (broker.data?.suspended_at) return "suspended";
  if (broker.data?.is_active) return "/dashboard";
  if (broker.data) return "/pending";
  return "/join";
}
