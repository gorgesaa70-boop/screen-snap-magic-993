import type { Property } from "./data";
import { formatPrice } from "./data";
import { mixByKind } from "./mix";
import { PropertyLink } from "./Sections";
import { thumb } from "@/lib/images";
import { t } from "@/lib/i18n";

const MAX = 14;
const PURPOSE: Record<string, string> = { "بيع": "للبيع", "إيجار": "للإيجار", "مصيف": "مصيف" };

/**
 * Under the home search: a strip of available units that slowly moves on its own (one of each kind in turn), and
 * follows the choices in the box. Stops when touched / hovered, and stays still (scrollable) for reduced-motion users.
 */
export function LiveStrip({ list }: { list: Property[] }) {
  const items = mixByKind(list.filter((p) => (p.availability ?? "available") === "available")).slice(0, MAX);
  if (items.length < 4) return null;
  const card = (p: Property, copy: boolean) => (
    <PropertyLink key={`${copy ? "b" : "a"}-${p.id}`} p={p}
      className="flex w-40 shrink-0 flex-col overflow-hidden rounded-xl border bg-card transition hover:border-teal hover:shadow-card md:w-48">
      <img src={thumb(p.image)} alt={copy ? "" : p.title} loading="lazy" decoding="async" width={192} height={128} className="h-24 w-full object-cover bg-muted md:h-28" />
      <span className="px-2.5 pt-2 text-sm font-extrabold text-primary">{p.price > 0 ? `${formatPrice(p.price)} ${t("ج.م")}` : t("السعر عند التواصل")}</span>
      <span className="truncate px-2.5 pb-2 text-xs text-muted-foreground">{t(p.type)} · {t(PURPOSE[p.status] ?? p.status)}{p.place ? ` · ${p.place}` : p.area ? ` · ${t(p.area)}` : ""}</span>
    </PropertyLink>
  );
  return (
    <div className="live-strip -mx-4 mt-3 overflow-hidden px-4 md:mx-0 md:px-0" aria-label={t("عقارات متاحة")}>
      {/* Two identical copies back to back (each ends with the same gap), so moving by half loops without a jump. */}
      <div className="live-strip-track flex w-max py-1" style={{ animationDuration: `${items.length * 6}s` }}>
        <div className="flex gap-2.5 pe-2.5">{items.map((p) => card(p, false))}</div>
        <div className="flex gap-2.5 pe-2.5" aria-hidden="true" inert>{items.map((p) => card(p, true))}</div>
      </div>
    </div>
  );
}
