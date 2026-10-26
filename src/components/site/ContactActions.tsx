import { MessageCircle, Phone } from "lucide-react";
import { t } from "@/lib/i18n";
import { waLink } from "@/components/site/data";

/** The number customers can reach an account on: its phone, or its WhatsApp when no phone is saved. */
export const contactNumber = (c?: { phone?: string | null; whatsapp?: string | null } | null) => c?.phone || c?.whatsapp || null;

/**
 * WhatsApp button for an account, plus the number and a call button when the database returned it
 * (an account the admin opened up). Without a number WhatsApp goes to Value Aqar's number (see waLink).
 */
export function ContactActions({ who, message, waLabel = "تواصل واتساب", className = "mt-4" }: {
  who: { phone?: string | null; whatsapp?: string | null } | null | undefined;
  message: string;
  waLabel?: string;
  className?: string;
}) {
  const num = contactNumber(who);
  return (
    <div className={`space-y-2 ${className}`}>
      <a href={waLink(who?.whatsapp || who?.phone, message)} target="_blank" rel="noreferrer" className="flex h-11 items-center justify-center gap-1.5 rounded-xl bg-whatsapp text-sm font-bold text-primary-foreground hover:brightness-95"><MessageCircle className="size-4" />{t(waLabel)}</a>
      {num && (
        <a href={`tel:${num}`} className="flex h-11 items-center justify-center gap-1.5 rounded-xl bg-teal text-sm font-bold text-accent-foreground hover:brightness-95">
          <Phone className="size-4" />{t("اتصال")} <span dir="ltr">{num}</span>
        </a>
      )}
    </div>
  );
}
