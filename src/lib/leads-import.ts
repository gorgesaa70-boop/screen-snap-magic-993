import { mapFields, type MapField } from "@/lib/sheet-mapping";
/** CRM: validation for importing customers (leads) from Excel / CSV. Pure functions — no I/O. Duplicates are flagged, never merged. */
import { normalizePhone } from "./broker-login";
import { key, norm, num } from "./units-import";
import { ARABIC_DIGITS, latinDigit } from "@/lib/digits";

export type LeadInput = { name: string; phone: string; phoneNorm: string; source: string; campaign: string | null; property_type: string | null; area: string | null; budget: number | null; details: string | null };
export type LeadImport = {
  leads: (LeadInput & { row: number })[];
  /** Same number already in the platform or earlier in the file — skipped unless the admin adds them anyway. */
  duplicates: (LeadInput & { row: number; reason: string })[];
  errors: { row: number; message: string }[];
};

type Field = "name" | "phone" | "source" | "campaign" | "property_type" | "area" | "budget" | "details";
const HEADERS: Record<Field, string[]> = {
  name: ["الاسم", "اسم العميل", "name", "full name", "full_name"],
  phone: ["الموبايل", "رقم الموبايل", "الهاتف", "رقم الهاتف", "phone", "mobile", "phone_number"],
  source: ["المصدر", "source"],
  campaign: ["الحملة", "اسم الحملة", "campaign", "campaign_name"],
  property_type: ["نوع العقار", "النوع", "property type", "type"],
  area: ["المنطقة", "الحي", "area"],
  budget: ["الميزانية", "budget"],
  details: ["التفاصيل", "ملاحظات", "details", "notes"],
};
/** Source column values (Arabic or English) → LEAD_SOURCES keys; anything else falls back to "excel". */
const SOURCES: Record<string, string> = {
  "الموقع": "website", website: "website", "واتساب": "whatsapp", whatsapp: "whatsapp", "فيسبوك": "facebook", facebook: "facebook", fb: "facebook",
  "إنستجرام": "instagram", "انستجرام": "instagram", instagram: "instagram", ig: "instagram", "تيك توك": "tiktok", tiktok: "tiktok",
  "جوجل": "google_ads", "إعلانات جوجل": "google_ads", google: "google_ads", "ترشيح": "referral", "إحالة": "referral", referral: "referral",
  "مكالمة": "phone_call", call: "phone_call", "زيارة": "walk_in", "زيارة المكتب": "walk_in", walk_in: "walk_in",
};
export const MAX_LEADS = 2000;
export const LEAD_HEADERS = ["الاسم", "الموبايل", "المصدر", "الحملة", "نوع العقار", "المنطقة", "الميزانية", "التفاصيل"];

export function parseLeadsSheet(rows: unknown[][], existingPhones: Iterable<string> = []): LeadImport {
  const out: LeadImport = { leads: [], duplicates: [], errors: [] };
  const header = (rows[0] ?? []).map(key);
  const col = {} as Record<Field, number>;
  for (const f of Object.keys(HEADERS) as Field[]) col[f] = header.findIndex((h) => HEADERS[f].some((a) => a.toLowerCase() === h));
  const missing = (["name", "phone"] as Field[]).filter((f) => col[f] < 0);
  if (missing.length) { out.errors.push({ row: 1, message: `الملف ناقصه عمود: ${missing.map((f) => HEADERS[f][0]).join("، ")}` }); return out; }
  const data = rows.slice(1);
  if (data.length > MAX_LEADS) { out.errors.push({ row: 1, message: `الملف فيه أكتر من ${MAX_LEADS} صف — قسّمه على أكتر من ملف` }); return out; }
  const existing = new Set(existingPhones);
  const seen = new Map<string, number>();

  data.forEach((r, i) => {
    const row = i + 2;
    if (r.every((v) => norm(v) === "")) return;
    const cell = (f: Field) => (col[f] >= 0 ? norm(r[col[f]]) : "");
    const problems: string[] = [];
    const name = cell("name").slice(0, 100);
    if (name.length < 2) problems.push("الاسم ناقص");
    const phone = cell("phone").replace(ARABIC_DIGITS, latinDigit).replace(/٫/g, ".").replace(/[^\d+]/g, "").slice(0, 20);
    const phoneNorm = normalizePhone(phone) ?? "";
    if (phoneNorm.length < 10) problems.push("رقم الموبايل غلط");
    const budget = num(r[col.budget] ?? null);
    if (budget === "bad" || (typeof budget === "number" && budget < 0)) problems.push("الميزانية لازم رقم");
    if (problems.length) { out.errors.push({ row, message: problems.join(" · ") }); return; }
    const lead: LeadInput = {
      name, phone, phoneNorm, source: SOURCES[key(cell("source"))] ?? "excel", campaign: cell("campaign").slice(0, 200) || null,
      property_type: cell("property_type").slice(0, 60) || null, area: cell("area").slice(0, 80) || null,
      budget: budget as number | null, details: cell("details").slice(0, 1000) || null,
    };
    const prev = seen.get(phoneNorm);
    if (existing.has(phoneNorm)) out.duplicates.push({ ...lead, row, reason: "الرقم متسجّل في المنصة" });
    else if (prev) out.duplicates.push({ ...lead, row, reason: `نفس رقم صف ${prev}` });
    else { seen.set(phoneNorm, row); out.leads.push({ ...lead, row }); }
  });
  return out;
}

/** Fields for «طابق الأعمدة» (any file layout, e.g. an export from another CRM); source and campaign can be one value. */
export const leadFields = (): MapField[] => mapFields(HEADERS, [
  ["name", "الاسم", { required: true }],
  ["phone", "الموبايل", { required: true }],
  ["source", "المصدر", { constant: "text" }],
  ["campaign", "الحملة", { constant: "text" }],
  ["property_type", "نوع العقار", { constant: "text" }],
  ["area", "المنطقة", { constant: "text" }],
  ["budget", "الميزانية"],
  ["details", "التفاصيل"],
]);
