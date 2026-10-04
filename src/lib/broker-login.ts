/** Pure, browser-safe helpers for phone-based sign-in. Used by server functions and tests. */

/** Canonical international digits (no "+"), mirrors public.normalize_phone in the database. */
export function normalizePhone(raw: string): string | null {
  let d = (raw || "").replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("00")) d = d.slice(2);
  else if (/^01[0125]\d{8}$/.test(d)) d = "2" + d;
  else if (/^1[0125]\d{8}$/.test(d)) d = "20" + d;
  return d;
}

export type BrokerMatch = { id: string; user_id: string | null; is_active: boolean; suspended: boolean; account_type: string };

export type LoginDecision =
  | { kind: "user"; userId: string }          // sign in to this exact existing account
  | { kind: "new" }                           // no account anywhere: plain user (customer / join flow, unchanged)
  | { kind: "conflict"; reason: string }      // ambiguous: stop, admin must review
  | { kind: "suspended" };

/**
 * Decide which account a verified phone belongs to. Never guesses:
 * any ambiguity between broker rows and auth users stops the sign-in.
 */
export function decideLogin(brokers: BrokerMatch[], authUserIds: string[]): LoginDecision {
  const authSet = [...new Set(authUserIds)];
  if (brokers.length > 1) return { kind: "conflict", reason: "multiple brokers" };
  if (brokers.length === 1) {
    const b = brokers[0]!;
    if (!b.user_id) return { kind: "conflict", reason: "broker not linked to an account" };
    if (authSet.some((id) => id !== b.user_id)) return { kind: "conflict", reason: "phone owned by another account" };
    if (b.suspended) return { kind: "suspended" };
    return { kind: "user", userId: b.user_id };
  }
  if (authSet.length > 1) return { kind: "conflict", reason: "multiple accounts" };
  if (authSet.length === 1) return { kind: "user", userId: authSet[0]! };
  return { kind: "new" };
}

/** A new login phone is taken if any broker row or auth user other than `userId` owns it. */
export function isPhoneTaken(brokers: BrokerMatch[], authUserIds: string[], userId: string): boolean {
  return brokers.some((b) => b.user_id !== userId) || authUserIds.some((id) => id !== userId);
}
