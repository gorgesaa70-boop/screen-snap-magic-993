import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type MallRow = Tables<"malls">;
export const MALL_UNIT_TYPES = ["محل تجاري", "مكتب إداري", "عيادة", "صيدلية", "معمل تحاليل", "مركز أشعة", "مركز علاج طبيعي", "مطعم / كافيه", "كشك", "شقة سكنية"];
/** Mall floors as written on listings; the price index reads them as levels 0–5. Ground and first are usually
 * shops, second and third offices or clinics, fourth homes. */
export const MALL_FLOORS = ["الأرضي", "الأول", "التاني", "التالت", "الرابع", "الخامس أو أعلى"];
/** Mall kinds; medical malls get a filter chip and a badge instead of a separate home section. */
export const MALL_KINDS: Record<string, string> = { commercial: "تجاري", medical: "طبي", administrative: "إداري", mixed: "متعدد الأنشطة" };

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
