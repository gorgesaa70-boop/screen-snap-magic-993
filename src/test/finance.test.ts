import { describe, expect, it } from "vitest";
import { displayStatus, remaining } from "@/lib/finance";

describe("commission status shown to users", () => {
  it("approved and past due shows as due", () => {
    expect(displayStatus({ status: "approved", due_date: "2026-10-01" }, "2026-10-11")).toBe("due");
    expect(displayStatus({ status: "partially_paid", due_date: "2026-10-11" }, "2026-10-11")).toBe("due");
  });
  it("not yet due, paid or disputed keep their status", () => {
    expect(displayStatus({ status: "approved", due_date: "2026-12-01" }, "2026-10-11")).toBe("approved");
    expect(displayStatus({ status: "paid", due_date: "2026-01-01" }, "2026-10-11")).toBe("paid");
    expect(displayStatus({ status: "disputed", due_date: "2026-01-01" }, "2026-10-11")).toBe("disputed");
  });
  it("remaining never goes negative and is zero when cancelled", () => {
    expect(remaining({ expected_amount: 37500, paid_amount: 10000, status: "partially_paid" })).toBe(27500);
    expect(remaining({ expected_amount: 100, paid_amount: 150, status: "paid" })).toBe(0);
    expect(remaining({ expected_amount: 5000, paid_amount: 0, status: "cancelled" })).toBe(0);
    expect(remaining({ expected_amount: null, paid_amount: 0, status: "expected" })).toBe(0);
  });
});
