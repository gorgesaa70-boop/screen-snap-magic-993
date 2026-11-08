import { useQuery } from "@tanstack/react-query";
import { Megaphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { t, useLang } from "@/lib/i18n";

/** Shown until the admin writes the first news line in لوحة الإدارة ← الإعدادات ← شريط الأخبار. */
const COMING_SOON = "أخبار برج العرب قريبًا على فاليو عقار";

/** Borg El Arab news line over the site header: the live lines, one after another. */
export function NewsTicker() {
  const { lang } = useLang();
  const q = useQuery({
    queryKey: ["site-news"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      // Before the release is applied the table doesn't exist: the line stays on «قريبًا».
      const { data, error } = await supabase.from("site_news").select("text_ar, text_en").eq("is_active", true).order("sort_order").order("created_at", { ascending: false }).limit(30);
      return error ? [] : (data ?? []);
    },
  });
  const news = q.data ?? [];
  const line = news.length ? news.map((n) => (lang === "en" && n.text_en) || n.text_ar).join("   •   ") : t(COMING_SOON);
  // Longer text moves for longer, so every line stays readable.
  const seconds = Math.max(22, Math.round(line.length * 0.22));
  return (
    <div className="ticker flex h-8 items-center gap-2 overflow-hidden bg-primary px-3 text-xs font-bold text-primary-foreground" role="marquee" aria-label={t("أخبار برج العرب")}>
      <span className="z-10 flex shrink-0 items-center gap-1 rounded-full bg-teal px-2 py-0.5 text-[11px] text-accent-foreground"><Megaphone className="size-3" />{t("أخبار")}</span>
      <div className="relative flex-1 overflow-hidden"><span className="ticker-line" style={{ animationDuration: `${seconds}s` }}>{line}</span></div>
    </div>
  );
}
