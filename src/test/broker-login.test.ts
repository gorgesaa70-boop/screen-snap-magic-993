import { describe, it, expect } from "vitest";
import { decideLogin, normalizePhone, type BrokerMatch } from "@/lib/broker-login";

const b = (o: Partial<BrokerMatch>): BrokerMatch => ({ id: "b1", user_id: "u1", is_active: true, suspended: false, account_type: "individual", ...o });

describe("normalizePhone", () => {
  it("unifies Egyptian formats", () => {
    for (const p of ["01012345678", "1012345678", "201012345678", "+20 101 234 5678", "00201012345678"]) expect(normalizePhone(p)).toBe("201012345678");
  });
  it("keeps other international numbers", () => { expect(normalizePhone("+965 5123 4567")).toBe("96551234567"); });
});

describe("decideLogin", () => {
  it("office with properties signs into its original account", () => expect(decideLogin([b({ user_id: "office", account_type: "office" })], ["office"])).toEqual({ kind: "user", userId: "office" }));
  it("individual broker signs into original account (email-registered, no phone on auth user)", () => expect(decideLogin([b({ user_id: "ind" })], [])).toEqual({ kind: "user", userId: "ind" }));
  it("pending account still signs in (routed to /pending)", () => expect(decideLogin([b({ is_active: false })], [])).toEqual({ kind: "user", userId: "u1" }));
  it("suspended account is blocked", () => expect(decideLogin([b({ is_active: false, suspended: true })], []).kind).toBe("suspended"));
  it("unregistered number → plain new user (no broker rights)", () => expect(decideLogin([], [])).toEqual({ kind: "new" }));
  it("duplicate brokers → conflict", () => expect(decideLogin([b({}), b({ id: "b2", user_id: "u2" })], []).kind).toBe("conflict"));
  it("broker not linked to a user → conflict, never creates a substitute", () => expect(decideLogin([b({ user_id: null })], []).kind).toBe("conflict"));
  it("phone on a different auth user → conflict", () => expect(decideLogin([b({})], ["other"]).kind).toBe("conflict"));
  it("several auth users share phone → conflict", () => expect(decideLogin([], ["a", "b"]).kind).toBe("conflict"));
  it("existing customer by phone keeps own account", () => expect(decideLogin([], ["c"])).toEqual({ kind: "user", userId: "c" }));
});
