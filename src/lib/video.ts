export type ParsedVideo = { platform: "youtube" | "facebook" | "tiktok"; url: string; embed: string | null; tall: boolean };

/**
 * Reads a pasted video link. Only these three sites are accepted, because the result goes into an iframe.
 * Short links (fb.watch, vm.tiktok.com) don't say which video they are, so they open on the platform (embed: null).
 */
export function parseVideo(raw: string | null | undefined): ParsedVideo | null {
  let u: URL;
  try { u = new URL((raw ?? "").trim()); } catch { return null; }
  if (u.protocol !== "https:") return null;
  const host = u.hostname.replace(/^(www|m|web)\./, "");
  const url = u.toString();
  const parts = u.pathname.split("/").filter(Boolean);

  if (host === "youtube.com" || host === "youtu.be") {
    const short = parts[0] === "shorts";
    const id = host === "youtu.be" ? parts[0] : short || parts[0] === "live" || parts[0] === "embed" ? parts[1] : u.searchParams.get("v");
    if (!id || !/^[\w-]{6,20}$/.test(id)) return null;
    return { platform: "youtube", url, embed: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`, tall: short };
  }
  if (host === "tiktok.com") {
    const at = parts.indexOf("video");
    const id = at >= 0 ? parts[at + 1] : undefined;
    if (!id || !/^\d{6,25}$/.test(id)) return null;
    return { platform: "tiktok", url, embed: `https://www.tiktok.com/embed/v2/${id}`, tall: true };
  }
  if (host === "vm.tiktok.com" || host === "vt.tiktok.com") return parts[0] ? { platform: "tiktok", url, embed: null, tall: true } : null;
  if (host === "fb.watch") return parts[0] ? { platform: "facebook", url, embed: null, tall: false } : null;
  if (host === "facebook.com") {
    const reel = parts.includes("reel") || parts.includes("reels");
    const known = reel || parts.includes("videos") || (parts[0] === "watch" && u.searchParams.has("v"));
    if (known) return { platform: "facebook", url, embed: `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url)}&show_text=false&autoplay=true`, tall: reel };
    if (parts[0] === "share") return { platform: "facebook", url, embed: null, tall: false };
  }
  return null;
}

export const VIDEO_HINT = "لينك فيديو عام من فيسبوك أو تيك توك أو يوتيوب";
export const VIDEO_NAMES: Record<ParsedVideo["platform"], string> = { youtube: "يوتيوب", facebook: "فيسبوك", tiktok: "تيك توك" };
