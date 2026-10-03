import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import type { PropertyRow } from "./data";

export type ZoneRow = Tables<"industrial_zones">;
export type ActivityRow = Tables<"industrial_activities">;

/** Industrial property kinds and which size fields apply to each. */
export const IND_TYPES = [
  { value: "أرض صناعية", land: true, built: false },
  { value: "مصنع مبنى بالكامل", land: true, built: true },
  { value: "جزء من مصنع أو مبنى صناعي", land: false, built: true },
] as const;
export const indType = (t: string) => IND_TYPES.find((x) => x.value === t) ?? IND_TYPES[0];

export async function fetchZones(all = false) {
  let q = supabase.from("industrial_zones").select("*").order("sort_order").order("name");
  if (!all) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}
export async function fetchActivities(all = false) {
  let q = supabase.from("industrial_activities").select("*").order("sort_order").order("name");
  if (!all) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export async function fetchIndustrialProperties(): Promise<PropertyRow[]> {
  const { data, error } = await supabase.from("properties").select("*")
    .eq("category", "industrial").eq("review_status", "approved")
    .order("is_featured", { ascending: false }).order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export type IndFilters = { q: string; zone: string; type: string; activity: string; status: string; minSize: string; maxSize: string; minPrice: string; maxPrice: string };
export const emptyInd: IndFilters = { q: "", zone: "", type: "", activity: "", status: "", minSize: "", maxSize: "", minPrice: "", maxPrice: "" };

export function applyInd(list: PropertyRow[], f: IndFilters) {
  const n = (v: string) => (v ? Number(v) : null);
  const [a, b, c, d] = [n(f.minSize), n(f.maxSize), n(f.minPrice), n(f.maxPrice)];
  const q = f.q.trim().toLowerCase();
  return list.filter((p) => {
    const size = Number(p.size);
    const price = Number(p.price);
    return (!q || [p.title, p.description, p.address, p.area].some((s) => s?.toLowerCase().includes(q)))
      && (!f.zone || p.zone_id === f.zone) && (!f.type || p.type === f.type)
      && (!f.activity || p.activity_id === f.activity) && (!f.status || p.status === f.status)
      && (a === null || size >= a) && (b === null || size <= b)
      && (c === null || price >= c) && (d === null || price <= d);
  });
}

/** Upload a video to the user's private folder and return a long-lived signed URL. */
export async function uploadVideo(file: File) {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("يجب تسجيل الدخول");
  if (!file.type.startsWith("video/")) throw new Error("الملف ليس فيديو");
  if (file.size > 50 * 1024 * 1024) throw new Error("حجم الفيديو أكبر من 50 ميجا");
  const ext = file.name.split(".").pop()?.toLowerCase() || "mp4";
  const path = `${u.user.id}/videos/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("media").upload(path, file, { contentType: file.type });
  if (error) throw error;
  const { data, error: e2 } = await supabase.storage.from("media").createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
  if (e2) throw e2;
  return data.signedUrl;
}
