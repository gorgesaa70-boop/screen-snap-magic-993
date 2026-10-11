import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { getLang } from "@/lib/i18n";

export const WHATSAPP_NUMBER = "201031958820"; // رقم واتساب بيزنس الخاص بالشركة

export type PropertyRow = Tables<"properties">;
export type BrokerRow = Tables<"brokers">;
export type LeadRow = Tables<"leads">;
export type PlanRow = Tables<"plans">;

export type Property = {
  id: string;
  title: string;
  description: string | null;
  image: string;
  images: string[];
  price: number;
  type: string;
  city: string;
  area: string;
  size: number;
  rooms?: number | undefined;
  baths?: number | undefined;
  lat?: number | undefined;
  lng?: number | undefined;
  status: "بيع" | "إيجار";
  updated: string;
  isDemo: boolean;
  featured: boolean;
  brokerId: string | null;
};

export const TYPES = ["شقة", "فيلا", "أرض", "محل", "مكتب", "دوبلكس"];
export const AREAS = ["الحي الأول", "الحي الثاني", "الحي الثالث", "الحي الرابع", "الحي الخامس", "الحي السادس", "الحي السابع", "الحي الثامن", "الحي التاسع"];
export const DEFAULT_CITY = "برج العرب الجديدة";
/** City -> its areas. Cities with no areas store the city name as the area. */
export const CITIES: Record<string, string[]> = {
  "برج العرب الجديدة": AREAS,
  "كينج مريوط": [],
  "مدينة العلمين": ["العلمين الجديدة", "الحي اللاتيني", "داون تاون", "الأبراج الشاطئية", "الحي السكني"],
  "الساحل الشمالي": [],
};
export const CITY_NAMES = Object.keys(CITIES);
export const areasOf = (city: string) => (CITIES[city]?.length ? CITIES[city]! : city ? [city] : []);
export const ACCOUNT_LABEL: Record<string, string> = { individual: "وسيط عقاري", office: "مكتب عقاري", owner: "مالك العقار" };

export const toProperty = (r: PropertyRow): Property => ({
  id: r.id,
  title: r.title,
  description: r.description,
  image: r.images?.[0] || r.image_url || "/demo/p1.jpg",
  images: r.images?.length ? r.images : [r.image_url || "/demo/p1.jpg"],
  price: Number(r.price),
  type: r.type,
  city: r.city,
  area: r.area,
  size: Number(r.size),
  rooms: r.rooms ?? undefined,
  baths: r.baths ?? undefined,
  lat: r.lat ?? undefined,
  lng: r.lng ?? undefined,
  status: r.status as Property["status"],
  updated: r.updated_at,
  isDemo: r.is_demo,
  featured: r.is_featured,
  brokerId: r.broker_id,
});

export const PUBLIC_BROKER_COLS = "id,slug,name,specialty,bio,photo_url,areas,phone,whatsapp,email,facebook,is_demo,account_type";
export type PublicBroker = Pick<BrokerRow, "id" | "slug" | "name" | "specialty" | "bio" | "photo_url" | "areas" | "phone" | "whatsapp" | "email" | "facebook" | "is_demo" | "account_type">;

export async function fetchPublicProperties(brokerId?: string) {
  let q = supabase.from("properties").select("*").eq("review_status", "approved").eq("category", "residential");
  if (brokerId) q = q.eq("broker_id", brokerId);
  const { data, error } = await q.order("is_featured", { ascending: false }).order("created_at", { ascending: false });
  if (error) throw error;
  return data.map(toProperty);
}

export async function fetchPublicBrokers() {
  const { data, error } = await supabase.from("brokers").select(PUBLIC_BROKER_COLS).eq("is_active", true).order("created_at");
  if (error) throw error;
  return data as PublicBroker[];
}

/** Lead kind -> Arabic label. listing = owner offering a property via /sell. */
export const LEAD_KINDS: Record<string, string> = { request: "طلب عقار", inquiry: "استفسار عقار", listing: "عرض مالك" };

export const STAGES: Record<string, string> = {
  new: "جديد",
  contacted: "تم التواصل",
  viewing: "معاينة",
  negotiating: "تفاوض",
  won: "تم الإغلاق",
  lost: "لم يكتمل",
};

export const REVIEW: Record<"draft" | "pending" | "approved" | "rejected", { label: string; cls: string }> = {
  draft: { label: "مسودة", cls: "bg-secondary text-primary" },
  pending: { label: "قيد المراجعة", cls: "bg-teal-soft text-primary" },
  approved: { label: "معتمد", cls: "bg-primary text-primary-foreground" },
  rejected: { label: "مرفوض", cls: "bg-destructive/10 text-destructive" },
};

export const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("");
export const waLink = (num: string | null | undefined, text: string) =>
  `https://wa.me/${(num || WHATSAPP_NUMBER).replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;

export const formatPrice = (n: number) => new Intl.NumberFormat(getLang() === "en" ? "en-US" : "ar-EG").format(n);
export const formatDate = (d: string) =>
  new Intl.DateTimeFormat(getLang() === "en" ? "en-US" : "ar-EG", { day: "numeric", month: "long", year: "numeric" }).format(new Date(d));

/** Upload an image to the user's private folder and return a long-lived signed URL. */
export async function uploadImage(file: File) {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("يجب تسجيل الدخول");
  if (file.size > 5 * 1024 * 1024) throw new Error("حجم الصورة أكبر من 5 ميجا");
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${u.user.id}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("media").upload(path, file, { contentType: file.type });
  if (error) throw error;
  const { data, error: e2 } = await supabase.storage.from("media").createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
  if (e2) throw e2;
  return data.signedUrl;
}
