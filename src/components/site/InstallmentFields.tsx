import { Field, inputCls } from "./ui";
import { ARABIC_DIGITS, latinDigit } from "@/lib/digits";
import { PAYMENT_LABEL, hasInstallments, monthlyFor, type PaymentMethod } from "@/lib/installments";
import { formatPrice } from "./data";
import { t } from "@/lib/i18n";

export type InstallmentDraft = { payment_method: PaymentMethod; down_payment: string; installment_years: string; monthly_installment: string; installment_note: string };
export const emptyInstallments: InstallmentDraft = { payment_method: "cash", down_payment: "", installment_years: "", monthly_installment: "", installment_note: "" };

const digits = (v: string, max = 13) => v.replace(ARABIC_DIGITS, latinDigit).replace(/\D/g, "").slice(0, max);

/** Checks the draft against the price; returns an error message or "". */
export function installmentError(d: InstallmentDraft, price: number) {
  if (!hasInstallments(d.payment_method)) return "";
  const years = Number(d.installment_years);
  if (!(years >= 1 && years <= 30)) return "اكتب عدد سنين التقسيط (من 1 لـ 30)";
  if (d.down_payment && Number(d.down_payment) >= price) return "المقدم لازم يكون أقل من السعر";
  return "";
}

/** What to save in properties (only when the listing is for sale). */
export function installmentPayload(d: InstallmentDraft, price: number) {
  if (!hasInstallments(d.payment_method)) return { payment_method: d.payment_method, down_payment: null, installment_years: null, monthly_installment: null, installment_note: null };
  const down = d.down_payment ? Number(d.down_payment) : 0;
  const years = Number(d.installment_years);
  const monthly = d.monthly_installment ? Number(d.monthly_installment) : monthlyFor(price, down, years);
  return {
    payment_method: d.payment_method, down_payment: d.down_payment ? down : null, installment_years: years,
    monthly_installment: monthly > 0 ? monthly : null, installment_note: d.installment_note.trim().slice(0, 500) || null,
  };
}

/** «طريقة الدفع» block for sale listings: cash / installments / both, then down payment, years and the monthly amount. */
export function InstallmentFields({ value, onChange, price, translate = false }: {
  value: InstallmentDraft; onChange: (v: InstallmentDraft) => void; price: number; translate?: boolean;
}) {
  const tr = (s: string) => (translate ? t(s) : s);
  const on = hasInstallments(value.payment_method);
  const auto = monthlyFor(price, Number(value.down_payment || 0), Number(value.installment_years || 0));
  return (
    <div className="grid gap-3 rounded-xl border border-dashed p-3 sm:col-span-2 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <span className="mb-1.5 block text-sm font-bold text-primary">{tr("طريقة الدفع")}</span>
        <div className="grid grid-cols-3 gap-2" role="radiogroup">
          {(Object.keys(PAYMENT_LABEL) as PaymentMethod[]).map((m) => (
            <button key={m} type="button" role="radio" aria-checked={value.payment_method === m} onClick={() => onChange({ ...value, payment_method: m })}
              className={`h-11 rounded-xl border text-sm font-bold transition ${value.payment_method === m ? "border-teal bg-teal/10 text-primary" : "border-border text-muted-foreground hover:border-teal/50"}`}>
              {tr(PAYMENT_LABEL[m])}
            </button>
          ))}
        </div>
      </div>
      {on && (
        <>
          <Field label={tr("المقدم (ج.م)")}><input className={inputCls} inputMode="numeric" dir="ltr" placeholder={tr("مثال: 300000")} value={value.down_payment} onChange={(e) => onChange({ ...value, down_payment: digits(e.target.value) })} /></Field>
          <Field label={tr("عدد سنين التقسيط")}><input className={inputCls} inputMode="numeric" dir="ltr" placeholder={tr("مثال: 5")} value={value.installment_years} onChange={(e) => onChange({ ...value, installment_years: digits(e.target.value, 2) })} /></Field>
          <Field label={tr("القسط الشهري (ج.م)")}>
            <input className={inputCls} inputMode="numeric" dir="ltr" placeholder={auto ? String(auto) : ""} value={value.monthly_installment} onChange={(e) => onChange({ ...value, monthly_installment: digits(e.target.value) })} />
            {auto > 0 && !value.monthly_installment && <span className="mt-1 block text-xs text-muted-foreground">{tr("محسوب لوحده:")} {formatPrice(auto)} {tr("ج.م")} — {tr("غيّره لو مختلف")}</span>}
          </Field>
          <Field label={tr("ملاحظات التقسيط (اختياري)")}><input className={inputCls} maxLength={500} placeholder={tr("مثال: خصم 10% للكاش، أو أقساط ربع سنوية")} value={value.installment_note} onChange={(e) => onChange({ ...value, installment_note: e.target.value })} /></Field>
        </>
      )}
    </div>
  );
}
