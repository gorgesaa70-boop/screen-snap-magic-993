// Item 29: pure helpers for Meta Lead Ads (Facebook / Instagram instant forms) — no secrets, no DB, unit-testable.

/** Lead ids announced by a Page "leadgen" webhook. */
export function parseLeadgen(payload: unknown): string[] {
  const p = payload as { object?: string; entry?: { changes?: { field?: string; value?: { leadgen_id?: unknown } }[] }[] };
  if (p?.object !== "page" || !Array.isArray(p.entry)) return [];
  const ids = new Set<string>();
  for (const e of p.entry) for (const c of e?.changes ?? []) {
    const id = c?.field === "leadgen" ? c.value?.leadgen_id : null;
    if (id != null && /^\d{1,40}$/.test(String(id))) ids.add(String(id));
  }
  return [...ids];
}

export type GraphLead = {
  id?: string;
  field_data?: { name?: string; values?: string[] }[];
  campaign_name?: string;
  ad_name?: string;
  platform?: string;
};

const NAME_FIELDS = ["full_name", "name", "الاسم", "الاسم بالكامل"];
const PHONE_FIELDS = ["phone_number", "phone", "رقم الهاتف", "رقم الموبايل"];

/** Graph API lead → the fields of meta_inbound_lead(). Unknown form questions go to the details text. */
export function mapGraphLead(l: GraphLead) {
  const fields = (l.field_data ?? []).map((f) => ({ key: String(f.name ?? "").trim(), value: (f.values ?? []).join("، ").trim() })).filter((f) => f.key && f.value);
  const pick = (keys: string[]) => fields.find((f) => keys.includes(f.key.toLowerCase()))?.value ?? "";
  const first = pick(["first_name"]), last = pick(["last_name"]);
  const name = pick(NAME_FIELDS) || [first, last].filter(Boolean).join(" ");
  const phone = pick(PHONE_FIELDS);
  const used = new Set([...NAME_FIELDS, ...PHONE_FIELDS, "first_name", "last_name"]);
  const details = fields.filter((f) => !used.has(f.key.toLowerCase())).map((f) => `${f.key.replace(/_/g, " ")}: ${f.value}`).join("\n");
  return {
    _ref: String(l.id ?? ""), _name: name.slice(0, 100), _phone: phone.slice(0, 20), _platform: String(l.platform ?? "fb"),
    _campaign: String(l.campaign_name ?? "").slice(0, 200), _ad: String(l.ad_name ?? "").slice(0, 150), _details: details.slice(0, 1000),
  };
}
