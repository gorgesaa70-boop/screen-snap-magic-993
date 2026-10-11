import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { formatPrice } from "@/components/site/data";

/** Investment opportunities (item 40): big deals with a public teaser; details are shared after an approved request. */
export type OpportunityRow = Tables<"investment_opportunities">;

export const OPP_KINDS: Record<string, string> = {
  development_land: "أرض للتطوير",
  running_business: "نشاط قائم للبيع",
  partnership: "شراكة",
  usufruct: "حق انتفاع / إيجار طويل",
  leased_asset: "أصل مؤجّر",
};
export const DEAL_KINDS: Record<string, string> = {
  full_sale: "بيع كامل",
  share_sale: "بيع حصة",
  partnership: "شراكة",
  usufruct: "حق انتفاع",
  funding: "تمويل / مستثمر",
};
/** Suggested activities (free text is allowed). */
export const ACTIVITIES = ["مول تجاري", "مول طبي", "كمبوند سكني", "فندق", "بنزينة", "مصنع", "مخزن", "مستشفى", "مدرسة", "مبنى إداري", "مطعم / كافيه", "أرض زراعية", "أخرى"];
export const PUBLIC_OPP_COLS = "id,opp_no,title,kind,activity,deal_kind,city,area,land_area,built_area,investment_min,investment_max,offered_share,expected_return,teaser,images,review_status,is_featured,created_at,updated_at";

export const oppNo = (n: number | null | undefined) => (n ? `INV-${String(n).padStart(6, "0")}` : "INV-—");

const million = (n: number) => (n >= 1_000_000 ? `${formatPrice(Math.round((n / 1_000_000) * 10) / 10)} مليون` : formatPrice(n));
/** "من 30 لـ 45 مليون ج.م", "من 30 مليون ج.م", or "السعر عند التواصل". */
export function investmentRange(o: Pick<OpportunityRow, "investment_min" | "investment_max">) {
  const a = o.investment_min, b = o.investment_max;
  if (a && b && a !== b) return `${million(Number(a))} – ${million(Number(b))} ج.م`;
  if (a || b) return `${a ? "من " : "لحد "}${million(Number(a ?? b))} ج.م`;
  return "السعر عند التواصل";
}

export async function fetchOpportunities() {
  const { data, error } = await supabase.from("investment_opportunities").select(PUBLIC_OPP_COLS)
    .eq("review_status", "approved").order("is_featured", { ascending: false }).order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as OpportunityRow[];
}

export async function fetchOpportunity(id: string) {
  const { data, error } = await supabase.from("investment_opportunities").select(PUBLIC_OPP_COLS).eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as OpportunityRow | null) ?? null;
}
