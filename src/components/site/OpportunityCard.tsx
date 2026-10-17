import { Link } from "@tanstack/react-router";
import { MapPin, Lock, TrendingUp, Maximize } from "lucide-react";
import { formatPrice } from "@/components/site/data";
import { DEAL_KINDS, OPP_KINDS, investmentRange, type OpportunityRow } from "@/lib/investments";
import { t, useLang } from "@/lib/i18n";
import { thumb } from "@/lib/images";

/** Investment opportunity teaser card (dark, distinct from regular listings). */
export function OpportunityCard({ o }: { o: OpportunityRow }) {
  useLang();
  return (
    <Link to="/investments/$id" params={{ id: o.id }}
      className="group flex h-full flex-col overflow-hidden rounded-2xl bg-primary text-primary-foreground shadow-card transition hover:-translate-y-0.5">
      <div className="relative aspect-[16/9] bg-navy-deep">
        {o.images[0] ? <img src={thumb(o.images[0])} alt={o.title} loading="lazy" className="size-full object-cover opacity-80 transition group-hover:opacity-100" />
          : <div className="grid size-full place-items-center"><TrendingUp className="size-12 text-teal" /></div>}
        <span className="absolute top-3 right-3 rounded-full bg-teal px-3 py-1 text-xs font-bold text-accent-foreground">{t(OPP_KINDS[o.kind] ?? o.kind)}</span>
        {o.is_featured && <span className="absolute top-3 left-3 rounded-full bg-[#f2b84b] px-2.5 py-1 text-[11px] font-bold text-primary">{t("مميزة")}</span>}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <p className="text-xs font-bold text-teal">{t(o.activity)} · {t(DEAL_KINDS[o.deal_kind] ?? o.deal_kind)}</p>
        <h3 className="mt-1 line-clamp-2 font-extrabold">{o.title}</h3>
        <p className="mt-2 text-lg font-extrabold">{t(investmentRange(o))}</p>
        <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold text-primary-foreground/85">
          <span className="flex items-center gap-1 rounded-lg bg-primary-foreground/10 px-2 py-1"><MapPin className="size-3.5 text-teal" />{o.area === o.city ? t(o.city) : `${t(o.area)}، ${t(o.city)}`}</span>
          {o.land_area && <span className="flex items-center gap-1 rounded-lg bg-primary-foreground/10 px-2 py-1"><Maximize className="size-3.5 text-teal" />{formatPrice(Number(o.land_area))} {t("م²")}</span>}
          {o.offered_share && <span className="rounded-lg bg-primary-foreground/10 px-2 py-1">{formatPrice(Number(o.offered_share))}% {t("معروض")}</span>}
          {o.expected_return && <span className="rounded-lg bg-primary-foreground/10 px-2 py-1">{t("عائد تقريبي")} {formatPrice(Number(o.expected_return))}%</span>}
        </div>
        <p className="mt-3 line-clamp-2 text-sm text-primary-foreground/75">{o.teaser}</p>
        <p className="mt-auto flex items-center gap-1 pt-3 text-xs font-bold text-teal"><Lock className="size-3.5" />{t("التفاصيل الكاملة بعد طلب المستثمر")}</p>
      </div>
    </Link>
  );
}
