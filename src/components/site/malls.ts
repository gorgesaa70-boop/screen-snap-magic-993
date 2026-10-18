import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { viaFeed } from "@/lib/feed";
import { fetchAll } from "@/lib/fetch-all";
import { isAvailable } from "./availability";

export type MallRow = Tables<"malls">;
export const MALL_UNIT_TYPES = ["محل تجاري", "مكتب إداري", "عيادة", "صيدلية", "معمل تحاليل", "مركز أشعة", "مركز علاج طبيعي", "مطعم / كافيه", "كشك", "شقة سكنية"];
/** Mall floors as written on listings; the price index reads them as levels 0–5. Ground and first are usually
 * shops, second and third offices or clinics, fourth homes. */
export const MALL_FLOORS = ["الأرضي", "الأول", "التاني", "التالت", "الرابع", "الخامس أو أعلى"];
/** Mall kinds; medical malls get a filter chip and a badge instead of a separate home section. */
export const MALL_KINDS: Record<string, string> = { commercial: "تجاري", medical: "طبي", administrative: "إداري", mixed: "متعدد الأنشطة" };

export async function fetchMalls(all = false) {
  return all ? queryMalls(true) : viaFeed("malls", () => queryMalls(false));
}
async function queryMalls(all: boolean) {
  let q = supabase.from("malls").select("*").order("sort_order").order("name");
  if (!all) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

/** Malls with available units: how many and the lowest price (home strip). Small, so phones don't download every unit. */
export async function fetchMallSummary() {
  return viaFeed("mall-summary", async () => {
    const [malls, units] = await Promise.all([
      queryMalls(false),
      // "*" keeps working before the availability column (release 30); only available units count.
      fetchAll((a, b) => supabase.from("properties").select("*").eq("category", "mall").eq("review_status", "approved").order("id").range(a, b)).then((rows) => rows.filter(isAvailable)),
    ]);
    return malls
      .map((m) => { const mine = units.filter((u) => u.mall_id === m.id); return { m, n: mine.length, from: mine.length ? Math.min(...mine.map((u) => Number(u.price))) : 0 }; })
      .filter((x) => x.n > 0)
      .sort((a, b) => b.n - a.n);
  });
}

export async function fetchMallUnits(mallId: string) {
  const { data, error } = await supabase.from("properties").select("*")
    .eq("category", "mall").eq("mall_id", mallId).eq("review_status", "approved")
    .order("is_featured", { ascending: false }).order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

/** The mall's photos: the gallery (release 29), or the single photo malls had before. The first one is the cover. */
export const mallImages = (m: { images?: string[] | null; logo_url: string | null }) => (m.images?.length ? m.images : m.logo_url ? [m.logo_url] : []);
