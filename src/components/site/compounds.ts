import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type CompoundRow = Tables<"compounds">;

export async function fetchCompounds(all = false) {
  let q = supabase.from("compounds").select("*").order("sort_order").order("name");
  if (!all) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export async function fetchCompoundUnits(compoundId: string) {
  const { data, error } = await supabase.from("properties").select("*")
    .eq("compound_id", compoundId).eq("review_status", "approved")
    .order("is_featured", { ascending: false }).order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}
