import { describe, expect, it } from "vitest";
import { storeFor } from "@/components/site/AppDownload";

describe("storeFor (QR / valueaqar.com/app)", () => {
  it("sends iPhones to the App Store", () => {
    expect(storeFor("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148")).toBe("ios");
  });
  it("sends Android phones to Google Play", () => {
    expect(storeFor("Mozilla/5.0 (Linux; Android 15; SM-S921B) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36")).toBe("android");
  });
  it("leaves desktops on the download page", () => {
    expect(storeFor("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36")).toBeNull();
    expect(storeFor("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 Safari/605.1.15")).toBeNull();
  });
});
