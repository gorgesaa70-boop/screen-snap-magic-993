import { Field, inputCls } from "./ui";
import { ARABIC_DIGITS, latinDigit } from "@/lib/digits";
import { DEV_APPROVAL_LABEL, remainingFor, type AssignmentDraft, type DevApproval } from "@/lib/assignment";
import { formatPrice } from "./data";
import { t } from "@/lib/i18n";

const digits = (v: string, max = 13) => v.replace(ARABIC_DIGITS, latinDigit).replace(/[^\d.]/g, "").slice(0, max);

/** The contract behind a «تنازل» listing: developer, contract price, what was paid and what is left, fee and approval. */
export function AssignmentFields({ value, onChange, translate = false }: { value: AssignmentDraft; onChange: (v: AssignmentDraft) => void; translate?: boolean }) {
  const tr = (s: string) => (translate ? t(s) : s);
  const set = (k: keyof AssignmentDraft, max?: number) => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...value, [k]: max ? digits(e.target.value, max) : e.target.value });
  const autoLeft = !value.remaining ? remainingFor(value) : null;
  return (
    <div className="grid gap-3 rounded-xl border-2 border-dashed border-[#e76f51]/50 p-3 sm:col-span-2 sm:grid-cols-2">
      <p className="text-sm font-extrabold text-primary sm:col-span-2">{tr("بيانات عقد التنازل")}</p>
      <Field label={tr("المطور")}><input className={inputCls} maxLength={120} value={value.developer} onChange={set("developer")} placeholder={tr("مثال: اسم شركة التطوير")} /></Field>
      <Field label={tr("سعر العقد الأصلي (ج.م)")}><input className={inputCls} inputMode="numeric" dir="ltr" value={value.contract_price} onChange={set("contract_price", 13)} /></Field>
      <Field label={tr("اللي اتدفع لحد دلوقتي (ج.م)")}><input className={inputCls} inputMode="numeric" dir="ltr" value={value.paid} onChange={set("paid", 13)} /></Field>
      <Field label={tr("الباقي على العقد (ج.م)")}>
        <input className={inputCls} inputMode="numeric" dir="ltr" value={value.remaining} onChange={set("remaining", 13)} placeholder={autoLeft != null ? String(autoLeft) : ""} />
        {autoLeft != null && <span className="mt-1 block text-xs text-muted-foreground">{tr("محسوب لوحده:")} {formatPrice(autoLeft)} {tr("ج.م")}</span>}
      </Field>
      <Field label={tr("عدد الشهور الباقية")}><input className={inputCls} inputMode="numeric" dir="ltr" value={value.months} onChange={set("months", 3)} placeholder={tr("مثال: 60")} /></Field>
      <Field label={tr("القسط الشهري (ج.م)")}><input className={inputCls} inputMode="numeric" dir="ltr" value={value.monthly} onChange={set("monthly", 13)} /></Field>
      <Field label={tr("ميعاد الاستلام")}><input className={inputCls} maxLength={40} value={value.delivery} onChange={set("delivery")} placeholder={tr("مثال: ديسمبر 2027 أو استلام فوري")} /></Field>
      <Field label={tr("رسوم التنازل عند المطور")}>
        <div className="grid grid-cols-[minmax(0,1fr)_5.5rem] gap-2">
          <input className={inputCls} inputMode="decimal" dir="ltr" value={value.fee} onChange={set("fee", 13)} placeholder={tr("اختياري")} />
          <select aria-label={tr("نوع الرسوم")} className={inputCls} value={value.fee_kind} onChange={(e) => onChange({ ...value, fee_kind: e.target.value as AssignmentDraft["fee_kind"] })}>
            <option value="pct">%</option><option value="amount">{tr("ج.م")}</option>
          </select>
        </div>
      </Field>
      <div className="sm:col-span-2">
        <span className="mb-1.5 block text-sm font-bold text-primary">{tr("المطور بيوافق على التنازل؟")}</span>
        <div className="grid grid-cols-3 gap-2" role="radiogroup">
          {(Object.keys(DEV_APPROVAL_LABEL) as DevApproval[]).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={value.dev_approval === k} onClick={() => onChange({ ...value, dev_approval: k })}
              className={`min-h-11 rounded-xl border px-2 text-xs font-bold transition ${value.dev_approval === k ? "border-teal bg-teal/10 text-primary" : "border-border text-muted-foreground hover:border-teal/50"}`}>
              {tr(k === "allowed" ? "أيوه" : k === "needs" ? "محتاج موافقة" : "مش عارف")}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
