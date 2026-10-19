/**
 * Per-employee permissions (release 38). Section keys are the admin tabs plus the staff pages; the database enforces
 * the sensitive ones (public.staff_can). «فريق فاليو عقار» (staff and their permissions) is never grantable.
 */
export type Level = "view" | "edit";
export type Perms = Record<string, string>;

export type Section = { key: string; label: string; hint?: string; viewOnly?: boolean };
export const SECTION_GROUPS: { label: string; sections: Section[] }[] = [
  { label: "العملاء والمبيعات", sections: [
    { key: "leads", label: "طلبات العملاء", hint: "الليدز ومتابعتها وتوزيعها" },
    { key: "wa_inbox", label: "محادثات الواتساب", hint: "يقرا ويرد على العملاء" },
    { key: "tasks", label: "المتابعات والمهام" },
    { key: "messages", label: "الرسايل" },
    { key: "review_alerts", label: "تنبيهات المراجعة" },
    { key: "routing", label: "قواعد التوزيع" },
    { key: "referrals", label: "الإحالات بين الوسطاء" },
  ] },
  { label: "الفلوس والتقارير", sections: [
    { key: "deals", label: "الصفقات", viewOnly: true },
    { key: "commissions", label: "العمولات والاتفاقيات", viewOnly: true },
    { key: "reports", label: "التقارير" },
  ] },
  { label: "العقارات", sections: [
    { key: "review", label: "مراجعة العقارات", hint: "قبول ورفض الإعلانات" },
    { key: "locations", label: "المناطق" },
    { key: "malls", label: "المولات" },
    { key: "compounds", label: "الكمبوندات" },
    { key: "projects", label: "المشروعات" },
    { key: "investments", label: "الفرص الاستثمارية" },
    { key: "industrial", label: "الصناعي" },
  ] },
  { label: "الخدمات", sections: [
    { key: "svc_requests", label: "طلبات الخدمات", hint: "تحويل الطلب لمقدم خدمة وتغيير حالته" },
    { key: "svc_providers", label: "مقدمين الخدمة", hint: "إضافة وتفعيل وتوثيق وتغيير الباقة" },
    { key: "svc_plans", label: "باقات الخدمات", hint: "الأسعار والمميزات" },
    { key: "svc_reviews", label: "التقييمات", hint: "إخفاء أو مسح التقييمات" },
  ] },
  { label: "الحسابات", sections: [
    { key: "brokers", label: "الحسابات والشركات" },
    { key: "accounts", label: "كل الحسابات" },
    { key: "plans", label: "الباقات" },
  ] },
  { label: "الإعدادات", sections: [
    { key: "assistant", label: "المساعد والزرار العايم" },
    { key: "announce", label: "رسالة التثبيت" },
    { key: "closed", label: "غلق الموقع" },
    { key: "wa", label: "رقم الواتساب العائم" },
    { key: "app", label: "التطبيق" },
    { key: "health", label: "الصيانة والنسخ الاحتياطي" },
    { key: "alerts", label: "الإشعارات الإدارية" },
    { key: "audit", label: "سجل التدقيق" },
  ] },
];
export const ALL_SECTIONS = SECTION_GROUPS.flatMap((g) => g.sections);

const all = (level: Level) => Object.fromEntries(ALL_SECTIONS.map((s) => [s.key, s.viewOnly ? "view" : level]));
export const TEMPLATES: { id: string; label: string; perms: Perms }[] = [
  { id: "support", label: "خدمة عملاء", perms: { leads: "edit", leads_scope: "mine", wa_inbox: "edit", tasks: "edit", messages: "edit" } },
  { id: "reviewer", label: "مراجع إعلانات", perms: { review: "edit", locations: "edit", review_alerts: "view" } },
  { id: "sales", label: "مدير مبيعات", perms: { leads: "edit", leads_scope: "all", wa_inbox: "edit", tasks: "edit", messages: "edit", routing: "edit", referrals: "edit", review_alerts: "edit", deals: "view", commissions: "view", reports: "view" } },
  { id: "services", label: "مسؤول الخدمات", perms: { svc_requests: "edit", svc_providers: "edit", svc_reviews: "edit", svc_plans: "view" } },
  { id: "assistant", label: "مساعد أدمن", perms: { ...all("edit"), leads_scope: "all" } },
];

/** What the signed-in user may do in a section (the admin gets {"*": "edit"}). */
export function can(perms: Perms | null | undefined, key: string, need: Level = "view") {
  if (!perms) return false;
  const v = perms["*"] ?? perms[key];
  return need === "edit" ? v === "edit" : v === "view" || v === "edit";
}
export const hasAny = (perms: Perms | null | undefined) => !!perms && Object.entries(perms).some(([k, v]) => k !== "leads_scope" && (v === "view" || v === "edit"));
