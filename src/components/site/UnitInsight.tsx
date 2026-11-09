import { Link } from "@tanstack/react-router";
import { BarChart3 } from "lucide-react";
import { t, useLang } from "@/lib/i18n";
import { formatPrice, type Property } from "./data";

/** Mall units look almost the same to search engines; these numbers make each page its own (release-free, from existing data). */
export type UnitSibling = { id: string; title: string; price: number; size: number; floor: string | null };
export type UnitContext = { mall: { id: string; name: string }; floor: string | null; siblings: UnitSibling[] };

const ppm = (u: { price: number; size: number }) => (u.price > 0 && u.size > 0 ? u.price / u.size : 0);
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const round = (n: number, step = 100) => Math.round(n / step) * step;

/** Down payment % and years from the listing's own plan, or from text like «مقدم 25% قسط على سنتين». */
function planOf(p: Property): { pct: number; years: number } | null {
  if (p.installments?.down != null && p.installments.years && p.price > 0) return { pct: Math.round((p.installments.down / p.price) * 100), years: p.installments.years };
  const text = (p.description ?? "").replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
  const pct = text.match(/مقدم\s*(\d{1,2})\s*%/);
  if (!pct) return null;
  const y = text.match(/(\d{1,2})\s*(?:سنين|سنوات|سنة|سنه)/);
  const years = y ? Number(y[1]) : /سنتين|سنتان/.test(text) ? 2 : /سنة|سنه/.test(text) ? 1 : 0;
  return years ? { pct: Number(pct[1]), years } : null;
}

/** «الحي الأول، برج العرب الجديدة» — mall units often store the mall's own name as their area. */
export const unitPlace = (p: Property, u: UnitContext) => (p.area === u.mall.name || !p.area ? p.city : p.area === p.city ? p.city : `${p.area}، ${p.city}`);

export function unitInsight(p: Property, u: UnitContext) {
  const me = ppm(p);
  const floorUnits = u.floor ? u.siblings.filter((s) => s.floor === u.floor && ppm(s) > 0) : [];
  const allUnits = u.siblings.filter((s) => ppm(s) > 0);
  const floorAvg = avg(floorUnits.map(ppm));
  const mallAvg = avg(allUnits.map(ppm));
  const sorted = [...floorUnits].sort((a, b) => a.price - b.price);
  const rank = sorted.findIndex((s) => s.id === p.id) + 1;
  const plan = planOf(p);
  const lines: string[] = [];
  lines.push(`${p.type} مساحتها ${formatPrice(p.size)} م²${u.floor ? ` في الدور ${u.floor}` : ""} بـ${u.mall.name}، ${unitPlace(p, u)}.`);
  if (me > 0) {
    let cmp = "";
    if (floorUnits.length >= 2 && floorAvg > 0) {
      const diff = Math.round(((me - floorAvg) / floorAvg) * 100);
      cmp = Math.abs(diff) < 2 ? "، نفس سعر متر باقي وحدات الدور تقريبًا" : `، ${diff < 0 ? "أقل" : "أعلى"} من متوسط الدور بـ ${formatPrice(Math.abs(diff))}%`;
    }
    lines.push(`سعر المتر ${formatPrice(round(me))} ج.م${cmp}.`);
  }
  if (rank > 0 && floorUnits.length >= 3) lines.push(rank === 1 ? `أرخص ${p.type} في الدور ده من ${formatPrice(floorUnits.length)} وحدات معروضة.` : `ترتيبها ${formatPrice(rank)} من ${formatPrice(floorUnits.length)} وحدات في الدور ده من الأرخص للأغلى.`);
  if (plan && p.price > 0) {
    const down = round((p.price * plan.pct) / 100, 50);
    const monthly = round((p.price - down) / (plan.years * 12), 50);
    lines.push(`مقدم ${formatPrice(plan.pct)}% يعني ${formatPrice(down)} ج.م، والقسط الشهري حوالي ${formatPrice(monthly)} ج.م على ${plan.years === 1 ? "سنة" : plan.years === 2 ? "سنتين" : `${plan.years} سنين`}.`);
  }
  if (allUnits.length >= 2 && mallAvg > 0) lines.push(`في ${u.mall.name} ${formatPrice(allUnits.length)} وحدة معروضة على فاليو عقار، ومتوسط سعر المتر فيها ${formatPrice(round(mallAvg))} ج.م.`);
  const meta = [lines[0], plan ? lines.find((l) => l.startsWith("مقدم")) : lines[1], lines.find((l) => l.startsWith("ترتيبها") || l.startsWith("أرخص"))].filter(Boolean).join(" ").slice(0, 300);
  const sameFloor = floorUnits.filter((s) => s.id !== p.id).sort((a, b) => a.price - b.price).slice(0, 10);
  return { lines, meta, sameFloor, floorAvg, mallAvg };
}

/** «عن الوحدة دي»: the unit's own numbers, and the other units on the same floor (linked). */
export function UnitInsight({ p, u }: { p: Property; u: UnitContext }) {
  useLang();
  const { lines, sameFloor } = unitInsight(p, u);
  return (
    <section className="mt-5 rounded-2xl border bg-card p-4">
      <h2 className="flex items-center gap-1.5 text-lg font-extrabold text-primary"><BarChart3 className="size-5 text-teal" />{t("عن الوحدة دي")}</h2>
      <div className="mt-2 space-y-1.5 text-sm leading-relaxed text-foreground/80">{lines.map((l) => <p key={l}>{l}</p>)}</div>
      {sameFloor.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-extrabold text-primary">{t("وحدات تانية في نفس الدور")}</h3>
          <ul className="mt-2 divide-y text-sm">
            {sameFloor.map((s) => (
              <li key={s.id}>
                <Link to="/properties/$id" params={{ id: s.id }} className="flex items-center justify-between gap-3 py-2 hover:text-teal">
                  <span className="min-w-0 truncate font-semibold">{s.title.split("—")[1]?.trim() || s.title}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatPrice(s.size)} م² · {formatPrice(s.price)} ج.م</span>
                </Link>
              </li>
            ))}
          </ul>
          <Link to="/malls/$id" params={{ id: u.mall.id }} className="mt-2 inline-block text-sm font-bold text-teal">{t("كل وحدات {name} ←", { name: u.mall.name })}</Link>
        </div>
      )}
    </section>
  );
}
