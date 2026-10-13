import { MessageCircle } from "lucide-react";
import { t, useLang } from "@/lib/i18n";
import { useUnreadMessages } from "@/lib/messages";

const badge = "grid min-w-5 place-items-center rounded-full bg-teal px-1 text-[10px] font-bold leading-5 text-accent-foreground";

/**
 * Header shortcut to the inbox (signed-in users only), with the unread count.
 * Hidden on small phones, where the header has no room left: there it lives in the menu (MessagesMenuLink),
 * and every new message also rings the bell.
 */
export function MessagesButton() {
  useLang();
  const { user, unread } = useUnreadMessages();
  if (!user) return null;
  const label = `${t("الرسايل")}${unread ? ` (${unread} ${t("غير مقروء")})` : ""}`;
  return (
    <a href="/messages" aria-label={label} title={t("الرسايل")}
      className="relative hidden size-10 place-items-center rounded-full text-primary transition-colors hover:bg-secondary sm:grid">
      <MessageCircle className="size-5" />
      {unread > 0 && <span className={`absolute -top-0.5 -end-0.5 ${badge}`}>{unread > 9 ? "9+" : unread}</span>}
    </a>
  );
}

export function MessagesMenuLink({ onClick, className }: { onClick: () => void; className: string }) {
  useLang();
  const { user, unread } = useUnreadMessages();
  if (!user) return null;
  return (
    <a href="/messages" onClick={onClick} className={className}>
      <MessageCircle className="size-4" /> {t("الرسايل")}
      {unread > 0 && <span className={badge}>{unread > 9 ? "9+" : unread}</span>}
    </a>
  );
}
