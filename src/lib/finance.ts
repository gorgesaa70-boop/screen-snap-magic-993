/**
 * Deals and commissions (items 14–15). These tables arrive with the 20261011200000 migration and are
 * read through the untyped `dbx` client until the generated Supabase types are refreshed.
 */
export type DealRow = {
  id: string;
  deal_no: number;
  lead_id: string;
  broker_id: string | null;
  unit_desc: string | null;
  reservation_date: string | null;
  reservation_amount: number | null;
  contract_date: string | null;
  contract_value: number | null;
  sale_date: string | null;
  sale_value: number | null;
  sale_requested_at: string | null;
  review_status: "draft" | "pending" | "approved" | "rejected" | "needs_info";
  review_note: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CommissionStatus = "expected" | "pending_review" | "approved" | "partially_paid" | "paid" | "disputed" | "cancelled";

export type CommissionRow = {
  id: string;
  commission_no: number;
  deal_id: string;
  broker_id: string | null;
  agreement_id: string | null;
  basis_value: number | null;
  rate: number | null;
  fixed_amount: number | null;
  expected_amount: number | null;
  paid_amount: number;
  due_date: string | null;
  status: CommissionStatus;
  status_note: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
};

export type AgreementRow = {
  id: string;
  deal_type: string;
  broker_id: string;
  rate: number | null;
  fixed_amount: number | null;
  effective_from: string;
  effective_to: string | null;
  notes: string | null;
  approved_by: string | null;
  approved_at: string;
};

export type PaymentRow = {
  id: string;
  commission_id: string;
  amount: number;
  paid_on: string;
  method: string;
  reference: string | null;
  proof_path: string | null;
  notes: string | null;
  created_at: string;
};

export const commissionNo = (n: number | null | undefined) => (n ? `C-${String(n).padStart(6, "0")}` : "C-—");

export const COMMISSION_STATUS: Record<CommissionStatus | "due", { label: string; cls: string }> = {
  expected: { label: "متوقعة", cls: "bg-secondary text-primary" },
  pending_review: { label: "بانتظار المراجعة", cls: "bg-teal-soft text-primary" },
  approved: { label: "معتمدة", cls: "bg-primary text-primary-foreground" },
  due: { label: "مستحقة", cls: "bg-destructive text-primary-foreground" },
  partially_paid: { label: "مدفوعة جزئيًا", cls: "bg-teal text-accent-foreground" },
  paid: { label: "مدفوعة", cls: "bg-teal-soft text-primary" },
  disputed: { label: "متنازع عليها", cls: "bg-destructive/10 text-destructive" },
  cancelled: { label: "ملغاة", cls: "bg-muted text-muted-foreground" },
};

export const PAYMENT_METHODS: Record<string, string> = { transfer: "تحويل بنكي", instapay: "إنستاباي", cash: "نقدي", cheque: "شيك", other: "أخرى" };

/** Approved / partly paid commissions whose due date has passed show as "due". */
export function displayStatus(c: { status: string; due_date: string | null }, today = new Date().toISOString().slice(0, 10)): CommissionStatus | "due" {
  if ((c.status === "approved" || c.status === "partially_paid") && c.due_date && c.due_date <= today) return "due";
  return c.status as CommissionStatus;
}

export const remaining = (c: { expected_amount: number | null; paid_amount: number; status: string }) =>
  c.status === "cancelled" ? 0 : Math.max(0, Number(c.expected_amount ?? 0) - Number(c.paid_amount ?? 0));
