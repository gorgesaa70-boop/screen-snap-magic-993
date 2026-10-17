import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { btnTeal } from "@/components/site/ui";
import { t, useLang } from "@/lib/i18n";
import { checkWhatsappLogin } from "@/lib/whatsapp-otp.functions";
import { loginLink } from "@/lib/whatsapp-login";

export type InboundStart = { phone: string; code: string; ticket: string; expiresIn: number };

/**
 * "Send us the code" step: the customer opens WhatsApp with the code pre-filled and sends it to Value Aqar.
 * Polls until the webhook confirms the message, then calls onConfirmed(ticket) once.
 */
export function WhatsappInbound({ start, busy, onConfirmed, onBack, onRestart }: {
  start: InboundStart;
  busy?: boolean;
  onConfirmed: (ticket: string) => void;
  onBack: () => void;
  onRestart: () => void;
}) {
  useLang();
  const check = useServerFn(checkWhatsappLogin);
  const [status, setStatus] = useState<"pending" | "confirmed" | "expired">("pending");
  const [left, setLeft] = useState(start.expiresIn);
  const done = useRef(false);

  useEffect(() => {
    done.current = false;
    setStatus("pending");
    setLeft(start.expiresIn);
    let stop = false;
    const poll = async () => {
      if (stop || done.current) return;
      const r = await check({ data: { phone: start.phone, ticket: start.ticket } }).catch(() => null);
      if (!r || stop || done.current) return;
      if (r.status !== "pending") {
        done.current = true;
        setStatus(r.status);
        if (r.status === "confirmed") onConfirmed(start.ticket);
      }
    };
    const id = setInterval(poll, 2500);
    const tick = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    // Coming back from WhatsApp: check right away instead of waiting for the next tick.
    const onVisible = () => { if (document.visibilityState === "visible") poll(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => { stop = true; clearInterval(id); clearInterval(tick); document.removeEventListener("visibilitychange", onVisible); window.removeEventListener("focus", onVisible); };
  }, [start]); // eslint-disable-line react-hooks/exhaustive-deps

  const expired = status === "expired" || left <= 0;
  const mmss = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;

  return (
    <div className="space-y-4">
      <p className="text-sm text-foreground/80">
        {t("علشان نتأكد إن الرقم بتاعك، ابعت الكود ده لفاليو عقار على واتساب من رقم")} <span dir="ltr" className="font-bold text-primary">+{start.phone}</span>
      </p>
      <div dir="ltr" className="rounded-xl border bg-muted/40 py-3 text-center text-3xl font-extrabold tracking-[0.4em] text-primary">{start.code}</div>
      {expired ? (
        <button type="button" onClick={onRestart} className={`${btnTeal} w-full`}>{t("كود جديد")}</button>
      ) : status === "confirmed" || busy ? (
        <p className="rounded-xl bg-teal/10 p-3 text-center text-sm font-bold text-primary">{t("وصلتنا رسالتك ✓ جارٍ الدخول...")}</p>
      ) : (
        <>
          <a href={loginLink(start.code)} target="_blank" rel="noopener noreferrer" className={`${btnTeal} w-full`}>{t("افتح واتساب وابعت الكود")}</a>
          <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-teal" />
            {t("مستنيين رسالتك... بعد ما تبعتها ارجع للصفحة دي.")} ({mmss})
          </p>
        </>
      )}
      <p className="text-xs text-muted-foreground">{t("الرسالة لازم تتبعت من نفس الرقم، ومتغيّرش الكود. الخدمة مجانية.")}</p>
      <button type="button" onClick={onBack} className="text-sm font-bold text-muted-foreground hover:text-primary">{t("تغيير الرقم")}</button>
    </div>
  );
}
