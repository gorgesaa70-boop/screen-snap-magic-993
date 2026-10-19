import { describe, expect, it } from "vitest";
import { ALL_SECTIONS, TEMPLATES, can, hasAny } from "@/lib/permissions";

describe("staff permissions", () => {
  it("the admin can do everything", () => {
    expect(can({ "*": "edit" }, "deals", "edit")).toBe(true);
    expect(can({ "*": "edit" }, "anything")).toBe(true);
  });

  it("view lets an employee look but not change; hidden means nothing", () => {
    const p = { leads: "view", review: "edit" };
    expect(can(p, "leads")).toBe(true);
    expect(can(p, "leads", "edit")).toBe(false);
    expect(can(p, "review", "edit")).toBe(true);
    expect(can(p, "malls")).toBe(false);
    expect(can(undefined, "leads")).toBe(false);
  });

  it("a scope alone isn't a permission", () => {
    expect(hasAny({ leads_scope: "all" })).toBe(false);
    expect(hasAny({ wa_inbox: "view" })).toBe(true);
    expect(hasAny({})).toBe(false);
  });

  it("money stays view-only in every template", () => {
    const money = ALL_SECTIONS.filter((s) => s.viewOnly).map((s) => s.key);
    expect(money).toEqual(expect.arrayContaining(["deals", "commissions"]));
    for (const t of TEMPLATES) for (const k of money) expect(t.perms[k] === "edit").toBe(false);
  });

  it("the team page is never grantable and services are", () => {
    const keys = ALL_SECTIONS.map((s) => s.key);
    expect(keys).not.toContain("staff");
    expect(keys).toEqual(expect.arrayContaining(["svc_requests", "svc_providers", "svc_plans", "svc_reviews"]));
  });
});
