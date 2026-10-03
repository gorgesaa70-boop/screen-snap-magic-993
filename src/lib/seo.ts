export const SITE_URL = "https://valueaqar.com";
export const SITE_NAME = "فاليو عقار";

const clip = (s: string, n = 160) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

type PageMeta = {
  path: string;
  title: string;
  description: string;
  image?: string | null;
  type?: string;
  noindex?: boolean;
  jsonLd?: Record<string, unknown>[];
};

/** Builds the head() result for a page: title, description, OG/Twitter, canonical, JSON-LD. */
export function pageHead(m: PageMeta) {
  const url = `${SITE_URL}${m.path}`;
  const description = clip(m.description);
  const image = m.image && /^https:\/\//.test(m.image) ? m.image : null;
  const meta: Record<string, string>[] = [
    { title: m.title },
    { name: "description", content: description },
    { property: "og:title", content: m.title },
    { property: "og:description", content: description },
    { property: "og:type", content: m.type ?? "website" },
    { property: "og:url", content: url },
    { property: "og:site_name", content: SITE_NAME },
    { property: "og:locale", content: "ar_EG" },
    { name: "twitter:card", content: image ? "summary_large_image" : "summary" },
    { name: "twitter:title", content: m.title },
    { name: "twitter:description", content: description },
  ];
  if (image) meta.push({ property: "og:image", content: image }, { name: "twitter:image", content: image });
  if (m.noindex) meta.push({ name: "robots", content: "noindex, follow" });
  return {
    meta,
    links: m.noindex ? [] : [{ rel: "canonical", href: url }],
    scripts: (m.jsonLd ?? []).map((j) => ({ type: "application/ld+json", children: JSON.stringify(j) })),
  };
}

export function breadcrumbs(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: `${SITE_URL}${it.path}` })),
  };
}

export const unavailableHead = (path: string, title: string) =>
  pageHead({ path, title: `${title} | ${SITE_NAME}`, description: "هذه الصفحة غير متاحة حاليًا على فاليو عقار.", noindex: true });

export const priceText = (price: unknown, status?: string | null) => {
  const n = Number(price);
  if (!n) return "";
  return `${n.toLocaleString("en-US")} ج.م${status === "إيجار" ? " شهريًا" : ""}`;
};
