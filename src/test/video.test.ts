import { describe, expect, it } from "vitest";
import { parseVideo } from "@/lib/video";

describe("parseVideo", () => {
  it("reads YouTube links", () => {
    expect(parseVideo("https://www.youtube.com/watch?v=dQw4w9WgXcQ")?.embed).toContain("youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(parseVideo("https://youtu.be/dQw4w9WgXcQ?si=abc")?.embed).toContain("/embed/dQw4w9WgXcQ");
    expect(parseVideo("https://www.youtube.com/shorts/dQw4w9WgXcQ")?.tall).toBe(true);
  });
  it("reads TikTok links", () => {
    expect(parseVideo("https://www.tiktok.com/@valueaqar/video/7301234567890123456")?.embed).toBe("https://www.tiktok.com/embed/v2/7301234567890123456");
  });
  it("reads Facebook links", () => {
    expect(parseVideo("https://www.facebook.com/valueaqar/videos/123456789/")?.embed).toContain("plugins/video.php");
    expect(parseVideo("https://m.facebook.com/reel/123456789")?.tall).toBe(true);
    expect(parseVideo("https://www.facebook.com/watch/?v=123456789")?.embed).toContain("plugins/video.php");
  });
  it("opens short links on the platform", () => {
    expect(parseVideo("https://vm.tiktok.com/ZMabc123/")).toMatchObject({ platform: "tiktok", embed: null });
    expect(parseVideo("https://fb.watch/abc123/")).toMatchObject({ platform: "facebook", embed: null });
  });
  it("refuses anything else", () => {
    for (const bad of ["", "not a link", "http://youtu.be/dQw4w9WgXcQ", "https://evil.com/watch?v=dQw4w9WgXcQ", "https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ", "javascript:alert(1)", "https://www.facebook.com/valueaqar", "https://www.tiktok.com/@valueaqar"]) {
      expect(parseVideo(bad)).toBeNull();
    }
  });
});
