import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { dbx } from "@/lib/dbx";
import { X } from "lucide-react";
import { WHATSAPP_NUMBER, waLink } from "./data";
import { t, useLang } from "@/lib/i18n";

export function WhatsAppMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
    </svg>
  );
}

/** Dashboards and account pages have their own tools; the button is for visitors on the public site. */
const HIDDEN = ["/admin", "/dashboard", "/account", "/auth", "/reset-password", "/commissions", "/deals", "/inquiries", "/leads", "/messages",
  "/my-", "/notifications", "/pending", "/reports", "/tasks", "/investor", "/join", "/investments/new", "/delete-account"];

/** The number the admin set in الإعدادات ← رقم الواتساب العائم, or null (before release 33, or empty) for the built-in one. */
export async function fetchFloatingWhatsapp(): Promise<string | null> {
  const { data, error } = await dbx.from("app_settings").select("floating_whatsapp").eq("id", 1).maybeSingle();
  return error || !data?.floating_whatsapp ? null : data.floating_whatsapp;
}
export const useFloatingWhatsapp = () => useQuery({ queryKey: ["floating-whatsapp"], queryFn: fetchFloatingWhatsapp, staleTime: 5 * 60_000 });

const HIDE_KEY = "va-wa-hidden";
const hiddenByVisitor = () => { try { return sessionStorage.getItem(HIDE_KEY) === "1"; } catch { return false; } };

/**
 * Always-visible WhatsApp button to Value Aqar (above the phone's bottom bar) with a short ready message (no links).
 * The small × hides it until the visitor comes back in a new session.
 */
export function FloatingWhatsApp() {
  useLang();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [hidden, setHidden] = useState(true);
  const number = useFloatingWhatsapp().data || WHATSAPP_NUMBER;
  useEffect(() => setHidden(hiddenByVisitor()), []);
  if (hidden || HIDDEN.some((p) => pathname.startsWith(p))) return null;
  const hide = () => {
    try { sessionStorage.setItem(HIDE_KEY, "1"); } catch { /* storage blocked: hidden until the page reloads */ }
    setHidden(true);
  };
  const open = () => {
    const text = t("مرحبًا، أنا جاي من صفحة فاليو عقار وعندي استفسار / محتاج مساعدة.");
    window.open(waLink(number, text), "_blank", "noopener,noreferrer");
  };
  return (
    <div className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-40 ltr:right-4 rtl:left-4 lg:bottom-6 print:hidden">
      <button type="button" onClick={open} aria-label={t("تواصل معنا على واتساب")} title={t("تواصل معنا على واتساب")}
        className="grid size-14 place-items-center rounded-full bg-[#25D366] text-white shadow-float transition hover:scale-105 active:scale-95">
        <WhatsAppMark className="size-7" />
      </button>
      <button type="button" onClick={hide} aria-label={t("إخفاء زرار الواتساب")} title={t("إخفاء زرار الواتساب")}
        className="absolute -top-1.5 grid size-6 place-items-center rounded-full border bg-background text-muted-foreground shadow-card hover:text-primary ltr:-left-1.5 rtl:-right-1.5">
        <X className="size-3.5" />
      </button>
    </div>
  );
}
