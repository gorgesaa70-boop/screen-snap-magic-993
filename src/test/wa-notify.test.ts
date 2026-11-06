import { describe, expect, it } from "vitest";
import { wantsWhatsapp } from "@/lib/wa-notify";

describe("wantsWhatsapp (release 48)", () => {
  it("sends new requests and inquiries to the responsible people without opting in", () => {
    expect(wantsWhatsapp("new_inquiry", null, false)).toBe(true);
    expect(wantsWhatsapp("new_request", null, false)).toBe(true);
  });
  it("keeps other notification types opt-in", () => {
    expect(wantsWhatsapp("broker_reply", null, false)).toBe(false);
    expect(wantsWhatsapp("plan_expiry", null, false)).toBe(false);
  });
  it("doesn't flood admins who never turned it on", () => {
    expect(wantsWhatsapp("new_inquiry", null, true)).toBe(false);
  });
  it("honors saved settings: switch and ticked types", () => {
    expect(wantsWhatsapp("new_inquiry", { whatsapp_enabled: false, whatsapp_types: ["new_inquiry"] }, false)).toBe(false);
    expect(wantsWhatsapp("new_request", { whatsapp_enabled: true, whatsapp_types: ["new_inquiry"] }, false)).toBe(false);
    expect(wantsWhatsapp("new_inquiry", { whatsapp_enabled: true, whatsapp_types: ["new_inquiry"] }, true)).toBe(true);
  });
});
