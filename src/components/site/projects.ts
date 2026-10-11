import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { PUBLIC_BROKER_COLS, type PublicBroker } from "@/components/site/data";

export type ProjectRow = Tables<"projects">;
export type UnitRow = Tables<"project_units">;

export const UNIT_TYPES = ["شقة", "دوبلكس", "بنتهاوس", "فيلا", "تاون هاوس", "توين هاوس", "شاليه", "استوديو", "محل", "مكتب", "عيادة"];

export const UNIT_STATUS: Record<string, { label: string; cls: string }> = {
  available: { label: "متاحة", cls: "bg-teal-soft text-primary" },
  reserved: { label: "محجوزة", cls: "bg-secondary text-primary" },
  sold: { label: "مباعة", cls: "bg-primary text-primary-foreground" },
  unavailable: { label: "غير متاحة", cls: "bg-destructive/10 text-destructive" },
};

export const AMENITIES = ["أمن 24 ساعة", "حمام سباحة", "نادي رياضي", "مساحات خضراء", "جراج", "منطقة تجارية", "مسجد", "حضانة", "ملاعب أطفال", "شاطئ خاص", "مدارس", "مستشفى / عيادات"];

export const projectCover = (p: Pick<ProjectRow, "images">) => p.images[0] || "/demo/p2.jpg";

/** Public projects, featured first. */
export async function fetchProjects() {
  const { data, error } = await supabase.from("projects").select("*, project_units(status)")
    .eq("review_status", "approved")
    .order("is_featured", { ascending: false }).order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function fetchProject(id: string) {
  const { data, error } = await supabase.from("projects").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const [u, d] = await Promise.all([
    supabase.from("project_units").select("*").eq("project_id", id).order("unit_type").order("price"),
    supabase.from("brokers").select(PUBLIC_BROKER_COLS).eq("id", data.developer_id).maybeSingle(),
  ]);
  if (u.error) throw u.error;
  return { project: data, units: u.data, developer: d.data as PublicBroker | null };
}
