import { describe, expect, it } from "vitest";
import { facebookDialogUrl, facebookEmail, publicOrigin, readCookie } from "@/lib/facebook-auth";

describe("Facebook sign-in", () => {
  it("asks Facebook for the profile and e-mail, coming back to our callback", () => {
    const u = new URL(facebookDialogUrl("123", "https://valueaqar.com/api/public/auth/facebook/callback", "abc"));
    expect(u.hostname).toBe("www.facebook.com");
    expect(u.searchParams.get("client_id")).toBe("123");
    expect(u.searchParams.get("redirect_uri")).toBe("https://valueaqar.com/api/public/auth/facebook/callback");
    expect(u.searchParams.get("state")).toBe("abc");
    expect(u.searchParams.get("scope")).toBe("public_profile,email");
  });
  it("the same e-mail is the same account; no e-mail gets a stable placeholder", () => {
    expect(facebookEmail("99", " Ahmed@Gmail.com ")).toBe("ahmed@gmail.com");
    expect(facebookEmail("99", null)).toBe("fb-99@facebook.valueaqar.invalid");
  });
  it("reads the state cookie", () => {
    expect(readCookie("a=1; va_fb_state=xyz; b=2", "va_fb_state")).toBe("xyz");
    expect(readCookie(null, "va_fb_state")).toBeNull();
  });
  it("uses the public host behind the proxy, https outside localhost", () => {
    expect(publicOrigin(new Request("http://internal:3000/x", { headers: { "x-forwarded-host": "valueaqar.com" } }))).toBe("https://valueaqar.com");
    expect(publicOrigin(new Request("http://localhost:5199/x"))).toBe("http://localhost:5199");
  });
});
