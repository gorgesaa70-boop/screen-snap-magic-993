/** Installments on sale listings (properties.payment_method / down_payment / installment_years / monthly_installment). */
export type PaymentMethod = "cash" | "installment" | "both";
export const PAYMENT_LABEL: Record<PaymentMethod, string> = { cash: "كاش", installment: "تقسيط", both: "كاش أو تقسيط" };

/** Equal monthly payments of what's left after the down payment (no interest), rounded up to the pound. */
export function monthlyFor(price: number, down: number, years: number) {
  if (!(price > 0) || !(years > 0) || down < 0 || down >= price) return 0;
  return Math.ceil((price - down) / (years * 12));
}

export const hasInstallments = (m: string | null | undefined) => m === "installment" || m === "both";

/** Down payment as a whole percent of the price (for the badge on cards). */
export const downPct = (price: number, down: number) => (price > 0 ? Math.round((down / price) * 100) : 0);
