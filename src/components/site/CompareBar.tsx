import { useRouterState } from "@tanstack/react-router";
import { Scale, X } from "lucide-react";
import { toast } from "sonner";
import { t, useLang } from "@/lib/i18n";
import { COMPARE_MAX, clearCompare, toggleCompare, useCompareIds } from "@/lib/compare";

/** Adds a listing to «قارن» or takes it out. */
export function CompareButton({ id, className = "" }: { id: string; className?: string }) {
  useLang();
  const ids = useCompareIds();
  const on = ids.includes(id);
  const label = on ? t("شيل من المقارنة") : t("قارن");
  return (
    <button type="button" aria-pressed={on} aria-label={label} title={label}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (!toggleCompare(id)) toast.error(t("تقدر تقارن {n} وحدات بالكتير", { n: COMPARE_MAX })); }}
      className={`grid size-10 place-items-center rounded-full shadow-card transition hover:scale-105 active:scale-95 ${on ? "bg-primary text-primary-foreground" : "bg-background/90 text-primary"} ${className}`}>
      <Scale className="size-5" />
    </button>
  );
}

/** Shows once something is picked, on every page except the comparison itself. */
export function CompareBar() {
  useLang();
  const ids = useCompareIds();
  const path = useRouterState({ select: (s) => s.location.pathname });
  if (!ids.length || path === "/compare") return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(8.75rem+env(safe-area-inset-bottom))] z-40 flex justify-center px-4 lg:bottom-6">
      <div className="pointer-events-auto flex items-center gap-1 rounded-full bg-primary p-1.5 text-primary-foreground shadow-float">
        <a href="/compare" className="flex h-10 items-center gap-2 rounded-full bg-teal px-4 text-sm font-extrabold text-accent-foreground"><Scale className="size-4" />{t("قارن {n} من {max}", { n: ids.length, max: COMPARE_MAX })}</a>
        <button type="button" aria-label={t("امسح المقارنة")} title={t("امسح المقارنة")} onClick={clearCompare} className="grid size-10 place-items-center rounded-full hover:bg-white/10"><X className="size-4" /></button>
      </div>
    </div>
  );
}
