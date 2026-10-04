import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { parseEvents, verifyChallenge, verifySignature, maskPhone } from "@/lib/whatsapp-webhook";

const sign = (body: string, s: string) => "sha256=" + createHmac("sha256", s).update(body).digest("hex");
const payload = {
  object: "whatsapp_business_account",
  entry: [{ changes: [{ field: "messages", value: {
    messages: [{ id: "wamid.A", from: "201012345678", type: "text", timestamp: "1700000000", text: { body: "secret text" } }],
    statuses: [{ id: "wamid.B", status: "failed", recipient_id: "201099999999", timestamp: "1700000001", errors: [{ code: 131026, title: "Undeliverable" }] }],
  } }] }],
};

describe("GET verification", () => {
  const q = (t: string) => new URLSearchParams({ "hub.mode": "subscribe", "hub.verify_token": t, "hub.challenge": "123" });
  it("returns challenge on correct token", () => expect(verifyChallenge(q("tok"), "tok")).toBe("123"));
  it("rejects wrong token", () => expect(verifyChallenge(q("bad"), "tok")).toBeNull());
  it("rejects when token not configured", () => expect(verifyChallenge(q("tok"), undefined)).toBeNull());
});

describe("POST signature", () => {
  const body = JSON.stringify(payload);
  it("accepts valid signature", async () => expect(await verifySignature(body, sign(body, "app"), "app")).toBe(true));
  it("rejects wrong signature", async () => expect(await verifySignature(body, sign(body, "other"), "app")).toBe(false));
  it("rejects tampered body", async () => expect(await verifySignature(body + " ", sign(body, "app"), "app")).toBe(false));
  it("rejects missing header/secret", async () => {
    expect(await verifySignature(body, null, "app")).toBe(false);
    expect(await verifySignature(body, sign(body, "app"), undefined)).toBe(false);
  });
});

describe("POST parsing", () => {
  it("extracts message and failed status without content or full phone", () => {
    const ev = parseEvents(payload);
    expect(ev).toHaveLength(2);
    expect(ev[0]).toMatchObject({ kind: "message", event_key: "msg:wamid.A", message_type: "text" });
    expect(ev[1]).toMatchObject({ kind: "status", status: "failed", error_code: "131026", event_key: "st:wamid.B:failed" });
    expect(JSON.stringify(ev)).not.toContain("secret text");
    expect(JSON.stringify(ev)).not.toContain("201012345678");
  });
  it("duplicate deliveries produce identical event keys (deduped by DB unique key)", () => {
    const keys = [...parseEvents(payload), ...parseEvents(payload)].map((e) => e.event_key);
    expect(new Set(keys).size).toBe(2);
  });
  it("different statuses of same message are distinct events", () => {
    const p = structuredClone(payload); const s = p.entry[0]?.changes[0]?.value.statuses[0]; if (s) s.status = "delivered";
    expect(parseEvents(p)[1]?.event_key).toBe("st:wamid.B:delivered");
  });
  it("ignores unrelated payloads", () => expect(parseEvents({ object: "page" })).toEqual([]));
  it("masks phones", () => expect(maskPhone("201012345678")).toBe("201*******78"));
});
