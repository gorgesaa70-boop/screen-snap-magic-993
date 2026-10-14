import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { getLang } from "@/lib/i18n";
import { UploadError, extensionFor, prepareImage, uploadErrorMessage } from "@/lib/images";
import { ARABIC_DIGITS, latinDigit } from "@/lib/digits";

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
  /** Rent: 'month'; summer: unit of the lowest price ('night' | 'week' | 'month' | 'season'); sale: undefined. */
  priceUnit?: string | undefined;
  /** Curated "special price" pick by Value Aqar (reason in one line, optional approximate yield %). */
  highlight?: { reason: string; yield?: number | undefined } | undefined;
  /** On-site check by the Value Aqar team (admins only). */
  verified?: { at: string; note?: string | undefined } | undefined;
  rent?: {
    night?: number | undefined; week?: number | undefined; month?: number | undefined; season?: number | undefined;
    furnished?: string | undefined; minMonths?: number | undefined; deposit?: number | undefined; guests?: number | undefined;
    from?: string | undefined; to?: string | undefined;
  } | undefined;
  lng?: number | undefined;
  status: "بيع" | "إيجار" | "مصيف";
  updated: string;
  isDemo: boolean;
  featured: boolean;
  finishing?: string | undefined;
  brokerId: string | null;
};

export const TYPES = ["شقة", "دوبلكس", "فيلا", "بيت", "عمارة", "استوديو", "شاليه", "أرض", "محل", "مكتب", "عيادة"];
/** Listing purpose (properties.status): sale, monthly rent, or summer / holiday rent. */
export const PURPOSES = ["بيع", "إيجار", "مصيف"] as const;
export const PURPOSE_LABEL: Record<string, string> = { "بيع": "للبيع", "إيجار": "للإيجار", "مصيف": "مصيف" };
/** Types offered per purpose (no land for rent). */
export const TYPES_FOR: Record<string, string[]> = {
  "": TYPES, "بيع": TYPES,
  "إيجار": TYPES.filter((t) => t !== "أرض"),
  "مصيف": ["شاليه", "فيلا", "شقة", "دوبلكس", "استوديو"],
};
export const PRICE_UNIT_LABEL: Record<string, string> = { night: " / الليلة", week: " / الأسبوع", month: " / شهريًا", season: " / الموسم" };
export const FURNISHED_LABEL: Record<string, string> = { furnished: "مفروش", semi: "نص فرش", unfurnished: "مش مفروش" };
/** properties.finishing. Asked for every built unit (not land); older listings may have none. */
export const FINISHING_LABEL: Record<string, string> = { skeleton: "عمدان / طوب أحمر", semi: "نص تشطيب", full: "تشطيب كامل", super_lux: "سوبر لوكس" };
/** Types that are built, so finishing applies. */
export const hasFinishing = (type: string) => !!type && type !== "أرض";
export const AREAS = ["الحي الأول", "الحي الثاني", "الحي الثالث", "الحي الرابع", "الحي الخامس", "الحي السادس", "الحي السابع", "الحي الثامن", "الحي التاسع"];
export const DEFAULT_CITY = "برج العرب الجديدة";
/** City -> its areas. Cities with no areas store the city name as the area. */
export const CITIES: Record<string, string[]> = {
  "برج العرب الجديدة": AREAS,
  "كينج مريوط": [],
  "مدينة العلمين": ["العلمين الجديدة", "الحي اللاتيني", "داون تاون", "الأبراج الشاطئية", "الحي السكني"],
  "الساحل الشمالي": ["سيدي عبد الرحمن", "رأس الحكمة", "الضبعة", "مراسي", "الحمام", "العلمين القديمة", "مرسى مطروح"],
};
export const CITY_NAMES = Object.keys(CITIES);
export const areasOf = (city: string) => (CITIES[city]?.length ? CITIES[city]! : city ? [city] : []);
/** Every selectable area across all cities (a city with no areas counts as one). */
export const ALL_AREAS = CITY_NAMES.flatMap(areasOf);
/** The city an area belongs to ("" if unknown). */
export const cityOfArea = (area: string) => CITY_NAMES.find((c) => c === area || areasOf(c).includes(area)) ?? "";
export const ACCOUNT_LABEL: Record<string, string> = { individual: "وسيط عقاري", office: "مكتب عقاري", owner: "مالك العقار", company: "شركة تسويق / وساطة", developer: "شركة تطوير" };

const num = (v: number | null | undefined) => (v == null ? undefined : Number(v));

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
  finishing: r.finishing ?? undefined,
  featured: r.is_featured,
  brokerId: r.broker_id,
  priceUnit: r.price_unit ?? (r.status === "إيجار" ? "month" : undefined),
  verified: r.verified_at ? { at: r.verified_at, note: r.verified_note ?? undefined } : undefined,
  highlight: r.is_highlight && r.highlight_reason ? { reason: r.highlight_reason, yield: num(r.highlight_yield) } : undefined,
  rent: r.status === "بيع" ? undefined : {
    night: num(r.price_night), week: num(r.price_week), month: num(r.price_month), season: num(r.price_season),
    furnished: r.furnished ?? undefined, minMonths: r.min_months ?? undefined, deposit: num(r.deposit), guests: r.guests ?? undefined,
    from: r.available_from ?? undefined, to: r.available_to ?? undefined,
  },
});

/** Columns the public may read. Phone / WhatsApp / e-mail come only from broker_contacts() (see withContacts). */
export const PUBLIC_BROKER_COLS = "id,slug,name,specialty,bio,photo_url,areas,facebook,is_demo,account_type,show_contact";
export type PublicBroker = Pick<BrokerRow, "id" | "slug" | "name" | "specialty" | "bio" | "photo_url" | "areas" | "phone" | "whatsapp" | "email" | "facebook" | "is_demo" | "account_type">;

/**
 * Adds contact details where the database allows them (account opened by an admin, or the viewer's own
 * account / admin / staff). Otherwise they stay null, and WhatsApp buttons fall back to Value Aqar's number.
 */
export async function withContacts<T extends { id: string }>(rows: T[]): Promise<(T & Pick<BrokerRow, "phone" | "whatsapp" | "email">)[]> {
  const ids = rows.map((r) => r.id);
  const { data } = ids.length ? await supabase.rpc("broker_contacts", { _ids: ids }) : { data: [] };
  const byId = new Map((data ?? []).map((c) => [c.id, c]));
  return rows.map((r) => { const c = byId.get(r.id); return { ...r, phone: c?.phone ?? null, whatsapp: c?.whatsapp ?? null, email: c?.email ?? null }; });
}

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
  return (await withContacts(data ?? [])) as PublicBroker[];
}

/** Lead kind -> Arabic label. listing = owner offering a property via /sell. */
export const LEAD_KINDS: Record<string, string> = { request: "طلب عقار", inquiry: "استفسار عقار", listing: "عرض مالك" };

/** Services section (separate from real-estate leads): categories, request and provider statuses. */
export const SERVICE_CATEGORIES: Record<string, string> = { engineering: "مكاتب هندسية", contracting: "مقاولات وتشطيبات", crafts: "صنايعية", media: "تصوير وميديا" };
export const SERVICE_REQUEST_STATUS: Record<string, { label: string; cls: string }> = {
  new: { label: "جديد", cls: "bg-teal-soft text-primary" },
  contacted: { label: "اتواصلنا", cls: "bg-secondary text-primary" },
  assigned: { label: "اتحوّل لمقدم خدمة", cls: "bg-[#f2b84b]/25 text-primary" },
  done: { label: "اتنفّذ", cls: "bg-primary text-primary-foreground" },
  closed: { label: "اتقفل", cls: "bg-muted text-muted-foreground" },
};
export const PROVIDER_STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: "قيد المراجعة", cls: "bg-[#f2b84b]/25 text-primary" },
  approved: { label: "معتمد", cls: "bg-teal-soft text-primary" },
  rejected: { label: "مرفوض", cls: "bg-destructive/10 text-destructive" },
  suspended: { label: "موقوف", cls: "bg-destructive/10 text-destructive" },
};
export const PROVIDER_KIND: Record<string, string> = { company: "شركة", technician: "فني" };
export const serviceRequestNo = (n?: number | null) => (n == null ? "" : `S-${String(n).padStart(6, "0")}`);
export const SERVICE_KIND_PLURAL: Record<string, string> = { company: "شركات ومكاتب", technician: "فنيين" };

/** A listing's term on its plan: still up (with days left), ends within a week (renewable), or ended (hidden). */
export function listingTerm(listedUntil: string | null | undefined): { label: string; cls: string; renewable: boolean; ended: boolean } | null {
  if (!listedUntil) return null;
  const days = Math.ceil((new Date(listedUntil).getTime() - Date.now()) / 864e5);
  if (days <= 0) return { label: "خلص واستخبى — جدّده", cls: "bg-destructive/10 text-destructive", renewable: true, ended: true };
  if (days <= 7) return { label: days === 1 ? "بيخلص بكرة" : `فاضل ${days} أيام`, cls: "bg-[#f2b84b]/25 text-primary", renewable: true, ended: false };
  return { label: `ظاهر لحد ${formatDate(listedUntil)}`, cls: "bg-secondary text-muted-foreground", renewable: false, ended: false };
}

/** What a listing plan gives, in words (numbers come from the plan, extra perks from its features). */
export function listingPlanLines(p: { max_properties: number; listing_days: number | null; featured_slots: number; features: string[] }) {
  return [
    p.max_properties === 1 ? "إعلان واحد ظاهر في نفس الوقت" : p.max_properties === 2 ? "إعلانين ظاهرين في نفس الوقت" : `${p.max_properties} إعلان ظاهرين في نفس الوقت`,
    p.listing_days ? `كل إعلان ظاهر ${p.listing_days} يوم وتقدر تجدّده` : "الإعلانات ظاهرة من غير مدة",
    ...(p.featured_slots > 0 ? [p.featured_slots === 1 ? "إعلان مميز واحد" : `${p.featured_slots} إعلانات مميزة`] : []),
    ...(p.features ?? []),
  ];
}

/** What a service plan gives, in words. */
export function servicePlanLines(p: { monthly_requests: number | null; max_photos: number; priority: number; features: string[] }) {
  return [
    p.monthly_requests == null ? "طلبات من غير حد في الشهر" : `لحد ${p.monthly_requests} طلب في الشهر`,
    `لحد ${p.max_photos} صورة من شغلك في ملفك`,
    ...(p.features ?? []),
  ];
}

/** Whole stars out of 5 as text, for cards. */
export const starsText = (n: number) => "★".repeat(Math.round(n)) + "☆".repeat(5 - Math.round(n));

/** Short names for the services directory groups (/services), keyed by the group's full title written in the request. */
const SERVICE_SHORT: [string, string][] = [
  ["مكاتب هندسية", "مكاتب هندسية"], ["شركات مقاولات", "مقاولات وتشطيبات"], ["صنايعية", "صنايعية"], ["شركات التصوير", "تصوير وميديا"],
];

/** What the request is about, by name: a service from the services directory, shared housing, the brokers' market,
 * a price estimate, a compound or project — otherwise the plain kind («طلب عقار» …). These forms all save kind = request,
 * so the name comes from the first part of the details they write (old requests read correctly too). */
export function leadKindLabel(l: { kind: string; details?: string | null; compound_id?: string | null; project_id?: string | null }) {
  const d = l.details ?? "";
  if (d.startsWith("دليل الخدمات")) {
    const [, role = "", group = ""] = d.split(" — ");
    const name = SERVICE_SHORT.find(([k]) => group.startsWith(k))?.[1] ?? (group || "خدمات");
    return `${role === "مقدم خدمة" ? "مقدم خدمة" : "طلب خدمة"} — ${name}`;
  }
  if (d.startsWith("سكن مشترك") || d.startsWith("سوق الوسطاء")) {
    const [head = "", who] = d.split(" — ");
    return `${head.replace(" (قريبًا)", "")}${who ? ` — ${who}` : ""}`;
  }
  if (d.startsWith("طلب تقييم")) return "طلب تقييم";
  if (l.kind === "request" && l.compound_id) return "طلب كمبوند";
  if (l.kind === "request" && l.project_id) return "طلب مشروع";
  return LEAD_KINDS[l.kind] ?? l.kind;
}

/** The 10-stage customer pipeline, in order. */
export const STAGES: Record<string, string> = {
  new: "جديد",
  contacted: "تم التواصل",
  qualified: "مؤهل",
  visit_scheduled: "تم تحديد زيارة",
  visited: "تمت الزيارة",
  reserved: "حجز",
  contracted: "عقد",
  sold: "بيع مؤكد",
  lost: "لم يكتمل",
  postponed: "مؤجل",
};
/** Stage name for a lead; the final stage reads "إيجار مؤكد" for rent / summer customers. */
export const stageLabel = (stage: string, purpose?: string | null) =>
  stage === "sold" && (purpose === "rent" || purpose === "summer") ? "إيجار مؤكد" : STAGES[stage] ?? stage;
export const DEAL_TYPE_LABEL: Record<string, string> = { sale: "بيع", rent: "إيجار شهري", summer: "مصيف" };
/** Stages that need extra data (and documents) before a lead can enter them — set from the lead's page. */
export const STAGES_WITH_DATA = ["visit_scheduled", "reserved", "contracted", "sold", "lost", "postponed"];
/** Finished leads: no follow-up reminders. */
export const CLOSED_STAGES = ["sold", "lost"];

export const REVIEW: Record<"draft" | "pending" | "approved" | "rejected", { label: string; cls: string }> = {
  draft: { label: "مسودة", cls: "bg-secondary text-primary" },
  pending: { label: "قيد المراجعة", cls: "bg-teal-soft text-primary" },
  approved: { label: "معتمد", cls: "bg-primary text-primary-foreground" },
  rejected: { label: "مرفوض", cls: "bg-destructive/10 text-destructive" },
};

export const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("");
export const waLink = (num: string | null | undefined, text: string) =>
  `https://wa.me/${(num || WHATSAPP_NUMBER).replace(ARABIC_DIGITS, latinDigit).replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;

export const formatPrice = (n: number) => new Intl.NumberFormat(getLang() === "en" ? "en-US" : "ar-EG").format(n);
export const formatDate = (d: string) =>
  new Intl.DateTimeFormat(getLang() === "en" ? "en-US" : "ar-EG", { day: "numeric", month: "long", year: "numeric" }).format(new Date(d));

/** Upload an image to the user's private folder and return a long-lived signed URL. */
export async function uploadImage(file: File) {
  // Fresh session first: an expired login shows up as a confusing storage permission error.
  const { data: sess } = await supabase.auth.getSession();
  let userId = sess.session?.user.id;
  if (!userId || (sess.session!.expires_at ?? 0) * 1000 < Date.now() + 60_000) userId = (await supabase.auth.refreshSession()).data.session?.user.id;
  if (!userId) throw new UploadError("سجّل دخول الأول عشان ترفع صور");
  const body = await prepareImage(file);
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extensionFor(body.type)}`;
  try {
    const { error } = await supabase.storage.from("media").upload(path, body, { contentType: body.type, cacheControl: "31536000" });
    if (error) throw error;
    const { data, error: e2 } = await supabase.storage.from("media").createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
    if (e2) throw e2;
    return data.signedUrl;
  } catch (e) {
    throw new UploadError(uploadErrorMessage(e));
  }
}

/** Where a lead came from. The original source is fixed; changes are logged on the lead. */
export const LEAD_SOURCES: Record<string, string> = {
  website: "الموقع",
  whatsapp: "واتساب",
  facebook: "فيسبوك",
  instagram: "إنستجرام",
  tiktok: "تيك توك",
  google_ads: "إعلانات جوجل",
  referral: "ترشيح / إحالة",
  phone_call: "مكالمة",
  walk_in: "زيارة المكتب",
  manual: "إدخال يدوي",
  excel: "ملف Excel",
  other: "أخرى",
};

/** Customer-facing lead number, e.g. VA-000123. */
export const leadNo = (n: number | null | undefined) => (n ? `VA-${String(n).padStart(6, "0")}` : "VA-—");
