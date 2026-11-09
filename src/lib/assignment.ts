/** «تنازل»: a sale listing that hands over an installment contract (release 55). */
export type DevApproval = "allowed" | "needs" | "unknown";
export type FeeKind = "pct" | "amount";

export const DEV_APPROVAL_LABEL: Record<DevApproval, string> = {
  allowed: "المطور بيوافق على التنازل",
  needs: "محتاج موافقة المطور",
  unknown: "مش معروف",
};

/** What the visitor sees (all of it is public; the contract photo never is). */
export type Assignment = {
  developer?: string | undefined;
  projectId?: string | undefined;
  contractPrice?: number | undefined;
  paid?: number | undefined;
  remaining?: number | undefined;
  months?: number | undefined;
  monthly?: number | undefined;
  delivery?: string | undefined;
  fee?: number | undefined;
  feeKind?: FeeKind | undefined;
  devApproval?: DevApproval | undefined;
  checkedAt?: string | undefined;
};

/** The developer's transfer fee in pounds (a percentage is taken from the contract price). */
export function feeAmount(a: Assignment): number | undefined {
  if (a.fee == null) return undefined;
  if (a.feeKind === "pct") return a.contractPrice != null ? Math.round((a.contractPrice * a.fee) / 100) : undefined;
  return a.fee;
}

/** Everything the buyer pays: the assignment amount now + what is left on the contract + the developer's fee. */
export function totalCost(price: number, a: Assignment): number {
  return price + (a.remaining ?? 0) + (feeAmount(a) ?? 0);
}

export type AssignmentDraft = {
  developer: string; contract_price: string; paid: string; remaining: string; months: string; monthly: string;
  delivery: string; fee: string; fee_kind: FeeKind; dev_approval: DevApproval;
};
export const emptyAssignment: AssignmentDraft = { developer: "", contract_price: "", paid: "", remaining: "", months: "", monthly: "", delivery: "", fee: "", fee_kind: "pct", dev_approval: "unknown" };

const n = (v: string) => (v ? Number(v) : null);

/** Fills the remaining amount from the contract price and what was paid, when it is left empty. */
export function remainingFor(d: AssignmentDraft): number | null {
  if (d.remaining) return Number(d.remaining);
  if (d.contract_price && d.paid) return Math.max(Number(d.contract_price) - Number(d.paid), 0);
  return null;
}

export function assignmentError(d: AssignmentDraft): string {
  if (d.developer.trim().length < 2) return "اكتب اسم المطور";
  if (!Number(d.contract_price)) return "اكتب سعر العقد الأصلي";
  if (d.paid === "") return "اكتب المدفوع لحد دلوقتي";
  if (Number(d.paid) > Number(d.contract_price)) return "المدفوع أكبر من سعر العقد";
  if (d.months && Number(d.months) > 360) return "عدد الشهور الباقية كبير أوي";
  if (d.fee_kind === "pct" && d.fee && Number(d.fee) > 100) return "نسبة رسوم التنازل لازم تكون أقل من 100%";
  return "";
}

/** Columns for properties (also what the owner form sends to the server). */
export function assignmentPayload(d: AssignmentDraft) {
  return {
    asg_developer: d.developer.trim().slice(0, 120) || null,
    asg_contract_price: n(d.contract_price), asg_paid: n(d.paid), asg_remaining: remainingFor(d),
    asg_months: n(d.months), asg_monthly: n(d.monthly), asg_delivery: d.delivery.trim().slice(0, 40) || null,
    asg_fee: n(d.fee), asg_fee_kind: d.fee ? d.fee_kind : null, asg_dev_approval: d.dev_approval,
  };
}

export function draftFrom(r: { asg_developer: string | null; asg_contract_price: number | null; asg_paid: number | null; asg_remaining: number | null; asg_months: number | null; asg_monthly: number | null; asg_delivery: string | null; asg_fee: number | null; asg_fee_kind: string | null; asg_dev_approval: string | null }): AssignmentDraft {
  const s = (v: number | null) => (v == null ? "" : String(v));
  return {
    developer: r.asg_developer ?? "", contract_price: s(r.asg_contract_price), paid: s(r.asg_paid), remaining: s(r.asg_remaining),
    months: s(r.asg_months), monthly: s(r.asg_monthly), delivery: r.asg_delivery ?? "", fee: s(r.asg_fee),
    fee_kind: (r.asg_fee_kind as FeeKind) ?? "pct", dev_approval: (r.asg_dev_approval as DevApproval) ?? "unknown",
  };
}
