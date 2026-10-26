import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { PUBLIC_BROKER_COLS, withContacts, type PublicBroker } from "@/components/site/data";
import { matchesArea } from "@/components/site/AreaFilter";
import { viaFeed } from "@/lib/feed";

export type CompoundRow = Tables<"compounds">;
export type CompoundUnitRow = Tables<"compound_units">;
export type CompoundMemberRow = Tables<"compound_members">;
export type CompoundRole = "admin" | "owner" | "manager" | "sales";

/** Unit types and amenities are shared with projects so filters read the same everywhere. */
export { UNIT_STATUS, UNIT_TYPES, AMENITIES } from "@/components/site/projects";

export const COMPOUND_ROLE_LABEL: Record<string, string> = {
  admin: "أدمن فاليو عقار", owner: "صاحب الكمبوند", manager: "مدير كمبوند", sales: "مبيعات",
};

export const compoundCover = (c: Pick<CompoundRow, "images" | "logo_url">) => c.images[0] || c.logo_url || "/demo/p2.jpg";
export const compoundWhere = (c: Pick<CompoundRow, "area" | "city" | "location">) =>
  c.area && c.city ? (c.area === c.city ? c.city : `${c.area}، ${c.city}`) : c.location ?? c.city ?? "";

/** Who the developer is: the linked account's name, or the name Value Aqar wrote while it runs the compound. */
export const developerLabel = (c: Pick<CompoundRow, "developer_name">, dev?: { name: string } | null) => dev?.name ?? c.developer_name ?? null;

/** Ready to move in when the delivery year is this year or earlier. */
export const isReady = (c: Pick<CompoundRow, "delivery_year">) => c.delivery_year != null && c.delivery_year <= new Date().getFullYear();

/** Active compounds for pickers (property form). Hidden ones are filtered by the database. */
export async function fetchCompounds(all = false) {
  let q = supabase.from("compounds").select("*").order("sort_order").order("name");
  if (!all) q = q.eq("is_active", true).eq("review_status", "approved");
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export type CompoundCard = CompoundRow & {
  compound_units: Pick<CompoundUnitRow, "unit_type" | "size" | "price" | "status" | "rooms">[];
  developer: { id: string; name: string; slug: string } | null;
};

/** Public list with a unit summary per compound (for cards and filters). */
export async function fetchCompoundCards(): Promise<CompoundCard[]> {
  return viaFeed("compounds", queryCompoundCards);
}
async function queryCompoundCards(): Promise<CompoundCard[]> {
  const { data, error } = await supabase.from("compounds")
    .select("*, compound_units(unit_type,size,price,status,rooms), developer:brokers!compounds_developer_id_fkey(id,name,slug)")
    .eq("is_active", true).eq("review_status", "approved")
    .order("is_featured", { ascending: false }).order("sort_order").order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as CompoundCard[];
}

/** One compound with its units, developer and broker resale listings inside it. */
export async function fetchCompound(id: string) {
  const { data, error } = await supabase.from("compounds").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const [u, d, resale] = await Promise.all([
    supabase.from("compound_units").select("*").eq("compound_id", id).order("building").order("unit_type").order("price"),
    data.developer_id ? supabase.from("brokers").select(PUBLIC_BROKER_COLS).eq("id", data.developer_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("properties").select("*").eq("compound_id", id).eq("review_status", "approved")
      .order("is_featured", { ascending: false }).order("created_at", { ascending: false }).limit(24),
  ]);
  if (u.error) throw u.error;
  // Contacts only come back for a developer the admin opened up (see broker_contacts).
  const developer = d.data ? ((await withContacts([d.data]))[0] as PublicBroker) : null;
  return { compound: data, units: u.data, developer, resale: resale.data ?? [] };
}

/** Kept for the Lovable-era callers: approved broker listings inside a compound. */
export async function fetchCompoundUnits(compoundId: string) {
  const { data, error } = await supabase.from("properties").select("*")
    .eq("compound_id", compoundId).eq("review_status", "approved")
    .order("is_featured", { ascending: false }).order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export type CompoundFilters = {
  city: string; area: string; developer: string; type: string; minPrice: string; maxPrice: string; minSize: string;
  maxDown: string; minYears: string; delivery: string; amenities: string[]; availableOnly: boolean;
};
export const EMPTY_COMPOUND_FILTERS: CompoundFilters = {
  city: "", area: "", developer: "", type: "", minPrice: "", maxPrice: "", minSize: "", maxDown: "", minYears: "", delivery: "", amenities: [], availableOnly: false,
};

/** Units of a compound that match the unit-level filters (type, price, size, availability). */
export function matchingUnits(c: CompoundCard, f: CompoundFilters) {
  const minP = Number(f.minPrice) || 0, maxP = Number(f.maxPrice) || Infinity, minS = Number(f.minSize) || 0;
  return c.compound_units.filter((u) =>
    (!f.availableOnly || u.status === "available") &&
    (!f.type || u.unit_type === f.type) &&
    (!f.minSize || Number(u.size) >= minS) &&
    (!f.minPrice && !f.maxPrice ? true : u.price != null && Number(u.price) >= minP && Number(u.price) <= maxP));
}

const unitFilterOn = (f: CompoundFilters) => !!(f.type || f.minPrice || f.maxPrice || f.minSize || f.availableOnly);

export function filterCompounds(list: CompoundCard[], f: CompoundFilters) {
  const year = new Date().getFullYear();
  return list.filter((c) =>
    matchesArea(c, f) &&
    (!f.developer || (developerLabel(c, c.developer) ?? "") === f.developer) &&
    (!f.maxDown || (c.down_payment_pct != null && Number(c.down_payment_pct) <= Number(f.maxDown))) &&
    (!f.minYears || (c.installment_years != null && c.installment_years >= Number(f.minYears))) &&
    (!f.delivery || (f.delivery === "ready" ? isReady(c) : c.delivery_year != null && c.delivery_year > year && c.delivery_year <= Number(f.delivery))) &&
    f.amenities.every((a) => c.amenities.includes(a)) &&
    (!unitFilterOn(f) || matchingUnits(c, f).length > 0));
}

/** Lowest available price in a compound (for the card). */
export function startingPrice(c: CompoundCard) {
  const prices = c.compound_units.filter((u) => u.status === "available" && u.price != null).map((u) => Number(u.price));
  return prices.length ? Math.min(...prices) : null;
}
