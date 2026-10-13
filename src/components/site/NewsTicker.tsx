import { Megaphone } from "lucide-react";
import { t } from "@/lib/i18n";

/** Borg El Arab news line over the site header. Static "coming soon" until news can be written from the admin panel. */
export const NEWS: string[] = ["أخبار برج العرب قريبًا على فاليو عقار"];

export function NewsTicker() {
  if (!NEWS.length) return null;
  const line = NEWS.map((n) => t(n)).join("   •   ");
  return (
    <div className="ticker flex h-8 items-center gap-2 overflow-hidden bg-primary px-3 text-xs font-bold text-primary-foreground" role="marquee" aria-label={t("أخبار برج العرب")}>
      <span className="z-10 flex shrink-0 items-center gap-1 rounded-full bg-teal px-2 py-0.5 text-[11px] text-accent-foreground"><Megaphone className="size-3" />{t("أخبار")}</span>
      <div className="relative flex-1 overflow-hidden"><span className="ticker-line">{line}</span></div>
    </div>
  );
}
