import type { Property } from "@/components/site/data";

/**
 * Search pages: one page per «type × purpose × place» (e.g. «شقق للبيع في برج العرب الجديدة»), so someone searching
 * Google for exactly that finds a page made for it. A page exists only while it has at least one real listing:
 * empty pages are noindex and stay out of the sitemap and the links (thin pages hurt the whole site).
 */
export type TypeGroup = { slug: string; plural: string; types: string[] };
export type PurposeDef = { slug: string; status: Property["status"]; label: string; noun: string };
export type PlaceDef = { slug: string; city: string; label: string };
export type Landing = { slug: string; type: TypeGroup; purpose: PurposeDef; place: PlaceDef };

export const TYPE_GROUPS: TypeGroup[] = [
  { slug: "apartments", plural: "شقق", types: ["شقة", "شقة سكنية", "دوبلكس", "استوديو"] },
  { slug: "houses", plural: "بيوت وعمارات", types: ["بيت", "عمارة"] },
  { slug: "villas", plural: "فيلات", types: ["فيلا"] },
  { slug: "land", plural: "أراضي", types: ["أرض"] },
  { slug: "shops", plural: "محلات", types: ["محل", "محل تجاري"] },
  { slug: "clinics", plural: "عيادات", types: ["عيادة"] },
  { slug: "offices", plural: "مكاتب إدارية", types: ["مكتب", "مكتب إداري"] },
  { slug: "chalets", plural: "شاليهات", types: ["شاليه"] },
];

export const PURPOSE_DEFS: PurposeDef[] = [
  { slug: "for-sale", status: "بيع", label: "للبيع", noun: "بيع" },
  { slug: "for-rent", status: "إيجار", label: "للإيجار", noun: "إيجار" },
  { slug: "summer", status: "مصيف", label: "مصيف", noun: "إيجار مصيف" },
];

export const PLACE_DEFS: PlaceDef[] = [
  { slug: "new-borg-el-arab", city: "برج العرب الجديدة", label: "برج العرب الجديدة" },
  { slug: "alamein", city: "مدينة العلمين", label: "العلمين" },
  { slug: "north-coast", city: "الساحل الشمالي", label: "الساحل الشمالي" },
];

export const ALL_LANDINGS: Landing[] = TYPE_GROUPS.flatMap((type) =>
  PURPOSE_DEFS.flatMap((purpose) => PLACE_DEFS.map((place) => ({ slug: `${type.slug}-${purpose.slug}-${place.slug}`, type, purpose, place }))));

export const findLanding = (slug: string) => ALL_LANDINGS.find((l) => l.slug === slug);
export const landingPath = (l: Landing) => `/real-estate/${l.slug}`;
export const landingTitle = (l: Landing) => `${l.type.plural} ${l.purpose.label} في ${l.place.label}`;

/** Still on offer (sold units drop out; reserved ones stay, marked on the card), and not an industrial listing. */
export const matches = (l: Landing, p: Property) =>
  p.kind !== "industrial" && !p.isDemo && p.availability !== "sold" &&
  p.status === l.purpose.status && l.type.types.includes(p.type) && p.city === l.place.city;

export const listingsFor = (l: Landing, all: Property[]) => all.filter((p) => matches(l, p));

/** The landing a listing belongs to (for the link back from its page), if any. */
export const landingOf = (p: Property) => ALL_LANDINGS.find((l) => matches(l, p));

/** A page goes to Google (sitemap, links, index) from this many listings; one listing alone is too thin a page. */
export const MIN_LISTINGS = 2;

/** Pages that have enough listings now, with their counts (for the sitemap, the hub page and the links). */
export function liveLandings(all: Property[]) {
  return ALL_LANDINGS.map((l) => ({ landing: l, count: listingsFor(l, all).length })).filter((x) => x.count >= MIN_LISTINGS);
}

/** Facts for the page text, all from the listings on it. */
export function landingStats(list: Property[]) {
  const prices = list.map((p) => p.price).filter((n) => n > 0).sort((a, b) => a - b);
  const perMeter = list.filter((p) => p.price > 0 && p.size > 0 && p.status === "بيع").map((p) => p.price / p.size).sort((a, b) => a - b);
  const median = (xs: number[]) => (xs.length ? xs[Math.floor(xs.length / 2)]! : 0);
  const areas = [...new Set(list.map((p) => p.area).filter(Boolean))];
  const places = [...new Set(list.map((p) => p.place).filter(Boolean))] as string[];
  return {
    count: list.length,
    min: prices[0] ?? 0,
    max: prices[prices.length - 1] ?? 0,
    median: median(prices),
    perMeter: Math.round(median(perMeter) / 100) * 100,
    areas,
    places,
    installments: list.filter((p) => p.installments || p.kind === "compound" || p.kind === "project").length,
    assignments: list.filter((p) => p.assignment).length,
  };
}

export const egp = (n: number) => `${n.toLocaleString("en-US")} ج.م`;
