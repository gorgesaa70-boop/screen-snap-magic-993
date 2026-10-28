import type { Property } from "./data";
import { canonicalType, TYPE_GROUPS } from "./search";

/** Kinds the unfiltered home list takes turns between, in this order. */
const BUCKETS = ["apartment", "land", "house", "mall", "compound", "commercial", "project", "industrial", "other"] as const;
type Bucket = (typeof BUCKETS)[number];

const APARTMENTS = ["شقة", "دوبلكس", "استوديو", "بنتهاوس"];
const COMMERCIAL = [...TYPE_GROUPS["commercial"]!, ...TYPE_GROUPS["office"]!];

export function bucketOf(p: Property): Bucket {
  if (p.kind) return p.kind;
  const t = canonicalType(p.type);
  if (t === "أرض") return "land";
  if (APARTMENTS.includes(t)) return "apartment";
  if (TYPE_GROUPS["residential"]!.includes(t)) return "house";
  if (COMMERCIAL.includes(t)) return "commercial";
  return "other";
}

/**
 * The home list without a search: one of each kind in turn (apartment, land, house, mall unit…), so a batch of
 * lands uploaded together doesn't fill the screen. Each kind keeps the order it came in (featured, then newest).
 */
export function mixByKind(list: Property[]): Property[] {
  const groups = new Map<Bucket, Property[]>(BUCKETS.map((b) => [b, []]));
  for (const p of list) groups.get(bucketOf(p))!.push(p);
  const queues = BUCKETS.map((b) => groups.get(b)!).filter((g) => g.length);
  const out: Property[] = [];
  for (let i = 0; out.length < list.length; i++) for (const q of queues) if (i < q.length) out.push(q[i]!);
  return out;
}
