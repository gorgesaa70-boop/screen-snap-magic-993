import { describe, it, expect } from "vitest";
import { mapGraphLead, parseLeadgen } from "@/lib/meta-leads";
import { parseInbound } from "@/lib/whatsapp-webhook";

describe("WhatsApp inbound messages (item 29)", () => {
  const payload = {
    object: "whatsapp_business_account",
    entry: [{ changes: [{ field: "messages", value: {
      contacts: [{ wa_id: "201012345678", profile: { name: "منى" } }],
      messages: [
        { id: "wamid.A", from: "201012345678", type: "text", text: { body: "عايزة شقة" } },
        { id: "wamid.B", from: "201099999999", type: "image" },
        { id: "wamid.C", from: "12", type: "text", text: { body: "x" } },
      ],
    } }] }],
  };
  it("reads sender, profile name and text", () => {
    const r = parseInbound(payload);
    expect(r).toHaveLength(2);
    expect(r[0]).toEqual({ wa_message_id: "wamid.A", phone: "201012345678", name: "منى", text: "عايزة شقة" });
    expect(r[1]).toMatchObject({ phone: "201099999999", name: null, text: "(image)" });
  });
  it("ignores other objects", () => expect(parseInbound({ object: "page", entry: [] })).toEqual([]));
});

describe("Meta Lead Ads (item 29)", () => {
  it("collects lead ids from leadgen changes only", () => {
    const p = { object: "page", entry: [{ changes: [{ field: "leadgen", value: { leadgen_id: "123" } }, { field: "feed", value: { leadgen_id: "9" } }, { field: "leadgen", value: { leadgen_id: "123" } }] }] };
    expect(parseLeadgen(p)).toEqual(["123"]);
    expect(parseLeadgen({ object: "page", entry: [{ changes: [{ field: "leadgen", value: { leadgen_id: "1; drop" } }] }] })).toEqual([]);
  });
  it("maps form answers to a lead", () => {
    const r = mapGraphLead({
      id: "L1", platform: "ig", campaign_name: "الساحل", ad_name: "شاليه",
      field_data: [{ name: "full_name", values: ["أحمد علي"] }, { name: "phone_number", values: ["+201055550020"] }, { name: "الميزانية", values: ["2 مليون"] }, { name: "best_time", values: ["بالليل"] }],
    });
    expect(r).toEqual({ _ref: "L1", _name: "أحمد علي", _phone: "+201055550020", _platform: "ig", _campaign: "الساحل", _ad: "شاليه", _details: "الميزانية: 2 مليون\nbest time: بالليل" });
  });
  it("joins first and last name", () => expect(mapGraphLead({ id: "2", field_data: [{ name: "first_name", values: ["سارة"] }, { name: "last_name", values: ["حسن"] }] })._name).toBe("سارة حسن"));
});
