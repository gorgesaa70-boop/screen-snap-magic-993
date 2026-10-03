import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type MallRow = Tables<"malls">;
export const MALL_UNIT_TYPES = ["محل تجاري", "مكتب إداري", "عيادة", "مطعم / كافيه", "كشك"];

export async function fetchMalls(all = false) {
  let q = supabase.from("malls").select("*").order("sort_order").order("name");
  if (!all) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export async function fetchMallUnits(mallId: string) {
  const { data, error } = await supabase.from("properties").select("*")
    .eq("category", "mall").eq("mall_id", mallId).eq("review_status", "approved")
    .order("is_featured", { ascending: false }).order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}
