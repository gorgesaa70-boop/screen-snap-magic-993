// Social auto-post (release 45): the caption, hashtags and card fields for one listing. Pure, so it is unit-tested;
// the card is drawn by social-card.server.ts and sent to Buffer by /api/public/social/dispatch.
import { FINISHING_LABEL, PRICE_UNIT_LABEL, PURPOSE_LABEL, listingCode } from "@/components/site/data";
import { SITE_URL } from "@/lib/seo";

/** The properties columns the post needs. */
export type SocialListing = {
  id: string;
  listing_no: number | null;
  title: string;
  description: string | null;
  type: string;
  status: string;
  city: string;
  area: string;
  size: number | null;
  rooms: number | null;
  baths: number | null;
  price: number | null;
  price_unit: string | null;
  finishing: string | null;
  payment_method: string | null;
  down_payment: number | null;
  installment_years: number | null;
  images: string[] | null;
  image_url: string | null;
};

const PLURAL: Record<string, string> = {
  "شقة": "شقق", "دوبلكس": "دوبلكسات", "فيلا": "فلل", "بيت": "بيوت", "عمارة": "عمارات", "استوديو": "استوديوهات",
  "شاليه": "شاليهات", "أرض": "أراضي", "محل": "محلات", "مكتب": "مكاتب", "عيادة": "عيادات",
};
const TYPE_ICON: Record<string, string> = { "أرض": "🧭", "محل": "🏬", "مكتب": "🏢", "عيادة": "🩺", "شاليه": "🏖️" };
/** One extra tag per type, used when the listing has no area of its own. */
const TYPE_TAG: Record<string, string> = {
  "شقة": "شقة_تمليك", "دوبلكس": "دوبلكس", "فيلا": "فلل", "بيت": "منزل_للبيع", "عمارة": "استثمار", "استوديو": "استوديو",
  "شاليه": "الساحل_الشمالي", "أرض": "قطعة_أرض", "محل": "محلات_تجارية", "مكتب": "مكتب_إداري", "عيادة": "عيادات_طبية",
};
/** Instagram takes at most 5 hashtags a post; the same 5 go to every channel. */
export const MAX_HASHTAGS = 5;

const tag = (s: string) => s.trim().replace(/[\s\-–—]+/g, "_").replace(/[^\p{L}\p{N}_]/gu, "").replace(/_+/g, "_").replace(/^_|_$/g, "");

/** 5 hashtags: brand, type + purpose, city, area (or the type), then installments (or the region). */
export function hashtags(l: SocialListing): string[] {
  const purpose = PURPOSE_LABEL[l.status] ?? "";
  const plural = PLURAL[l.type] ?? l.type;
  const area = l.area && l.area !== l.city ? l.area : "";
  const raw = [
    "فاليو_عقار",
    `${plural}_${purpose}`,
    l.city,
    area || TYPE_TAG[l.type] || "",
    isInstallment(l) ? "تقسيط" : "عقارات_الإسكندرية",
    // fallbacks when one of the above is empty or repeated
    `عقارات_${l.city}`, "عقارات", "عقارات_مصر",
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of raw) {
    const t = r ? tag(r) : "";
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push("#" + t);
    if (out.length === MAX_HASHTAGS) break;
  }
  return out;
}

const isInstallment = (l: SocialListing) => l.status === "بيع" && (l.payment_method === "installment" || l.payment_method === "both");

/** 1 سنة · 2 سنتين · 3–10 سنين · 11+ سنة */
const years = (n: number) => (n === 1 ? "سنة" : n === 2 ? "سنتين" : n <= 10 ? `${n} سنين` : `${n} سنة`);

const fmt = (n: number) => new Intl.NumberFormat("ar-EG", { maximumFractionDigits: 0 }).format(n);
const fmtSize = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** The listing's own details, one line each (the description is free text from the broker). */
const descLines = (l: SocialListing) => (l.description ?? "").split(/\r?\n|\|/).map((s) => s.trim()).filter(Boolean);

export const listingUrl = (l: SocialListing) => `${SITE_URL}/properties/${l.id}`;

/** Down payment as a share of the price, when both are known. */
function downShare(l: SocialListing) {
  if (!l.down_payment || !l.price) return null;
  const pct = Math.round((Number(l.down_payment) / Number(l.price)) * 100);
  return pct > 0 && pct < 100 ? pct : null;
}

export function caption(l: SocialListing, opts: { appUrl?: string | null } = {}): string {
  const purpose = PURPOSE_LABEL[l.status] ?? "";
  const unit = l.price_unit ? (PRICE_UNIT_LABEL[l.price_unit] ?? "") : l.status === "إيجار" ? PRICE_UNIT_LABEL["month"]! : "";
  const icon = TYPE_ICON[l.type] ?? "🏠";
  const where = [l.city, l.area !== l.city ? l.area : ""].filter(Boolean).join(" – ");
  const lines: string[] = ["فاليو عقار", `${icon} ${l.title}${l.title.includes(purpose) ? "" : ` ${purpose}`}`, `📍 ${where}`];
  if (l.price) {
    const perMeter = l.status === "بيع" && l.size && l.type !== "عمارة" ? ` · سعر المتر ${fmt(Number(l.price) / Number(l.size))} جنيه` : "";
    lines.push(`💰 ${fmt(Number(l.price))} جنيه${unit.replace(" / ", " ")}${perMeter}`);
  }
  if (isInstallment(l)) {
    const pct = downShare(l);
    const parts = [pct ? `مقدم ${pct}%` : l.down_payment ? `مقدم ${fmt(Number(l.down_payment))} جنيه` : "", l.installment_years ? `على ${years(l.installment_years)}` : ""].filter(Boolean);
    lines.push(`💳 تقسيط${parts.length ? `: ${parts.join(" ")}` : ""}${l.payment_method === "both" ? " أو كاش" : ""}`);
  } else if (l.status === "بيع" && l.payment_method === "cash") {
    lines.push("💳 كاش");
  }
  const facts = [`نوع الوحدة: ${l.type}`, l.size ? `📐 ${fmtSize(Number(l.size))} م²` : "", l.rooms ? `🛏️ ${l.rooms} غرف` : "", l.baths ? `🛁 ${l.baths} حمام` : ""].filter(Boolean);
  lines.push(`${icon} ${facts.join(" · ")}`);
  if (l.finishing && FINISHING_LABEL[l.finishing]) lines.push(`🧱 التشطيب: ${FINISHING_LABEL[l.finishing]}`);
  const details = descLines(l).join(" · ");
  if (details) lines.push(`📝 ${details.length > 400 ? `${details.slice(0, 399)}…` : details}`);
  if (l.listing_no != null) lines.push(`🔖 كود العقار: ${listingCode(l.listing_no)}`);
  lines.push(`👈 الصور والتفاصيل: ${listingUrl(l)}`);
  if (opts.appUrl) lines.push(`📲 حمّل التطبيق: ${opts.appUrl}`);
  lines.push("", hashtags(l).join(" "));
  return lines.join("\n");
}

/** Short title for TikTok photo posts (up to 90 characters). */
export function shortTitle(l: SocialListing) {
  const purpose = PURPOSE_LABEL[l.status] ?? "";
  const t = `${l.title}${l.title.includes(purpose) ? "" : ` ${purpose}`}`;
  return t.length > 90 ? `${t.slice(0, 89)}…` : t;
}

/** What the card image shows. */
export type CardFields = { code: string; chip: string; title: string; place: string; price: string; size: string; specLabel: string; spec: string; photo: string | null };

export function cardFields(l: SocialListing): CardFields {
  const purpose = PURPOSE_LABEL[l.status] ?? "";
  const unit = l.price_unit ? (PRICE_UNIT_LABEL[l.price_unit] ?? "") : l.status === "إيجار" ? PRICE_UNIT_LABEL["month"]! : "";
  let specLabel = "المواصفات", spec = "";
  if (isInstallment(l)) {
    const pct = downShare(l);
    specLabel = "نظام السداد";
    spec = [pct ? `مقدم ${pct}%` : "تقسيط", l.installment_years ? years(l.installment_years) : ""].filter(Boolean).join(" · ");
  } else if (l.rooms || l.baths) {
    spec = [l.rooms ? `${l.rooms} غرف` : "", l.baths ? `${l.baths} حمام` : ""].filter(Boolean).join(" · ");
  } else if (l.finishing && FINISHING_LABEL[l.finishing]) {
    specLabel = "التشطيب";
    spec = FINISHING_LABEL[l.finishing]!;
  } else {
    specLabel = "النوع";
    spec = `${l.type} ${purpose}`.trim();
  }
  const place = [l.city, l.area !== l.city ? l.area : "", ...descLines(l).slice(0, 2)].filter(Boolean).join(" - ");
  return {
    code: l.listing_no != null ? listingCode(l.listing_no) : "",
    chip: `${PLURAL[l.type] ?? l.type} ${purpose}`.trim(),
    title: `${l.title}${l.title.includes(purpose) ? "" : ` ${purpose}`}${l.title.includes(l.city) ? "" : ` – ${l.city}`}`,
    place,
    price: l.price ? `${fmt(Number(l.price))} ج.م${unit}` : "السعر عند التواصل",
    size: l.size ? `${fmtSize(Number(l.size))} م²` : "—",
    specLabel,
    spec: spec || "—",
    photo: l.images?.[0] || l.image_url || null,
  };
}
