import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { t, useLang } from "@/lib/i18n";
import { cleanPhone } from "@/lib/phone";
import { inputCls, btnPrimary } from "@/components/site/ui";
import { ALL_AREAS, SERVICE_CATEGORIES } from "@/components/site/data";

export const SERVICE_GROUPS = [
  { id: "engineering", label: "مكاتب هندسية معتمدة من فاليو عقار", hint: "تصميم، رخص، إشراف، معاينة قبل الشراء" },
  { id: "contracting", label: "شركات مقاولات وتشطيبات", hint: "بناء، تشطيب كامل أو نص تشطيب، ترميم" },
  { id: "crafts", label: "صنايعية", hint: "سباك، كهربائي، نجار، نقاش، ألوميتال، تكييف" },
  { id: "media", label: "شركات التصوير والميديا", hint: "تصوير عقاري احترافي، فيديو ودرون، جولات 360°، إعلانات وسوشيال ميديا" },
] as const;
export type ServiceGroup = (typeof SERVICE_GROUPS)[number]["id"];

/**
 * Ask for a service. With a provider (from their profile) the request goes to them first; otherwise Value Aqar's
 * routing offers it to the best match. The customer's phone reaches the provider only after they accept.
 */
export function ServiceRequestForm({ provider, category, onCategory }: { provider?: { id: string; name: string; category: string }; category?: ServiceGroup | undefined; onCategory?: ((c: ServiceGroup) => void) | undefined }) {
  useLang();
  const [f, setF] = useState({ group: (provider?.category ?? category ?? "crafts") as ServiceGroup, area: "", what: "", name: "", phone: "" });
  const group = category && !provider ? category : f.group;
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const phone = cleanPhone(f.phone);
    if (f.name.trim().length < 2 || !phone) { toast.error(t("اكتب الاسم ورقم هاتف صحيح")); return; }
    setBusy(true);
    const { error } = await supabase.from("service_requests").insert({
      category: provider?.category ?? group, name: f.name.trim().slice(0, 100), phone,
      details: f.what.trim().slice(0, 1000) || null, area: f.area || null, ...(provider ? { target_provider_id: provider.id } : {}),
    });
    setBusy(false);
    if (error) { toast.error(t("الطلب ماتبعتش، جرّب تاني")); return; }
    setDone(true);
  }
  if (done) return (
    <div className="rounded-2xl border bg-card p-6 text-center">
      <p className="text-lg font-bold text-primary">{t("طلبك وصل ✓")}</p>
      <p className="mt-2 text-sm text-muted-foreground">{provider ? t("طلبك اتبعت لـ {name} عن طريق فاليو عقار، ولو مش متاح هنوصّلك بأنسب مقدم خدمة غيره. هيكلّمك أول ما يقبل الطلب.", { name: provider.name }) : t("بنوصّل طلبك لأنسب مقدم خدمة في تخصصك ومنطقتك، وهيكلّمك أول ما يقبل الطلب.")}</p>
      <p className="mt-2 text-xs text-muted-foreground">{t("سجّل دخول بنفس الرقم عشان تتابع طلبك وتقيّم الخدمة بعد ما تخلص.")}</p>
    </div>
  );
  return (
    <form id="service-request" onSubmit={submit} className="h-fit space-y-3 rounded-2xl border bg-card p-5">
      <p className="font-extrabold text-primary">{provider ? t("اطلب من {name}", { name: provider.name }) : t("اطلب خدمة")}</p>
      {!provider && (
        <select aria-label={t("نوع الخدمة")} className={inputCls} value={group} onChange={(e) => { const g = e.target.value as ServiceGroup; setF({ ...f, group: g }); onCategory?.(g); }}>
          {SERVICE_GROUPS.map((g) => <option key={g.id} value={g.id}>{t(g.label)}</option>)}
        </select>
      )}
      {provider && <p className="text-xs text-muted-foreground">{t(SERVICE_CATEGORIES[provider.category] ?? "")}</p>}
      <select aria-label={t("المنطقة")} className={inputCls} value={f.area} onChange={(e) => setF({ ...f, area: e.target.value })}>
        <option value="">{t("المنطقة (اختياري)")}</option>
        {ALL_AREAS.map((a) => <option key={a} value={a}>{t(a)}</option>)}
      </select>
      <textarea className={`${inputCls} h-24 py-2`} placeholder={t("محتاج إيه بالظبط؟")} value={f.what} onChange={(e) => setF({ ...f, what: e.target.value })} maxLength={1000} />
      <input className={inputCls} placeholder={t("الاسم")} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={100} required />
      <input className={inputCls} placeholder={t("رقم الهاتف")} dir="ltr" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} maxLength={20} required />
      <button disabled={busy} className={`${btnPrimary} w-full`}>{busy ? "..." : t("ابعت الطلب")}</button>
      <p className="text-xs text-muted-foreground">{t("رقمك بيوصل لمقدم الخدمة بس بعد ما يقبل طلبك.")}</p>
    </form>
  );
}

/** Join as a provider (company / office or technician): saved for Value Aqar's review. */
export function ProviderJoinForm() {
  useLang();
  const [f, setF] = useState({ kind: "technician" as "technician" | "company", group: "crafts" as ServiceGroup, what: "", name: "", phone: "" });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const phone = cleanPhone(f.phone);
    if (f.name.trim().length < 2 || !phone) { toast.error(t("اكتب الاسم ورقم هاتف صحيح")); return; }
    setBusy(true);
    const { error } = await supabase.from("service_providers").insert({ kind: f.kind, category: f.group, name: f.name.trim().slice(0, 100), phone, specialty: f.what.trim().slice(0, 120) || null });
    setBusy(false);
    if (error) { toast.error(error.code === "23505" ? t("الرقم ده مسجّل كمقدم خدمة قبل كده — سجّل دخول برقمك عشان تتابع حسابك.") : t("الطلب ماتبعتش، جرّب تاني")); return; }
    setDone(true);
  }
  if (done) return (
    <div className="rounded-2xl border bg-card p-6 text-center">
      <p className="text-lg font-bold text-primary">{t("اتسجّلت ✓")}</p>
      <p className="mt-2 text-sm text-muted-foreground">{t("طلب انضمامك كمقدم خدمة وصل لفاليو عقار للمراجعة. سجّل دخول بنفس رقم الموبايل عشان تكمّل ملفك وتضيف صور شغلك، والطلبات هتبدأ توصلك بعد الاعتماد.")}</p>
      <a href="/auth" className={`${btnPrimary} mt-4`}>{t("تسجيل الدخول")}</a>
    </div>
  );
  return (
    <form id="provider-join" onSubmit={submit} className="h-fit space-y-3 rounded-2xl border bg-card p-5">
      <p className="font-extrabold text-primary">{t("انضم كمقدم خدمة")}</p>
      <div className="grid grid-cols-2 gap-1.5">
        {([["company", "شركة أو مكتب"], ["technician", "فني"]] as const).map(([k, l]) => (
          <button key={k} type="button" aria-pressed={f.kind === k} onClick={() => setF({ ...f, kind: k })}
            className={`h-10 rounded-xl border text-sm font-bold ${f.kind === k ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground"}`}>{t(l)}</button>
        ))}
      </div>
      <select aria-label={t("نوع الخدمة")} className={inputCls} value={f.group} onChange={(e) => setF({ ...f, group: e.target.value as ServiceGroup })}>
        {SERVICE_GROUPS.map((g) => <option key={g.id} value={g.id}>{t(g.label)}</option>)}
      </select>
      <input className={inputCls} placeholder={t("تخصصك (مثال: سباكة، تشطيبات...)")} value={f.what} onChange={(e) => setF({ ...f, what: e.target.value })} maxLength={120} />
      <input className={inputCls} placeholder={t(f.kind === "company" ? "اسم الشركة" : "الاسم")} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={100} required />
      <input className={inputCls} placeholder={t("رقم الهاتف")} dir="ltr" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} maxLength={20} required />
      <button disabled={busy} className={`${btnPrimary} w-full`}>{busy ? "..." : t("سجّلني")}</button>
    </form>
  );
}
