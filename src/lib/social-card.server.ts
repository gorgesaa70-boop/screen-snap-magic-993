// Draws the 1080×1080 social post card (same layout as the approved sample): header with logo and chips, the listing's
// first photo, title / place, price · size · specs boxes, and the brand footer. Text is SVG rendered by resvg (Arabic
// shaping + right-to-left); the photo is decoded separately (WebP via jsquash, JPEG/PNG by resvg) and composited under
// it, then the result is encoded as JPEG (TikTok and Instagram take JPEG). Runs on the server only.
import type { CardFields } from "@/lib/social-post";

const W = 1080, H = 1080;
const PHOTO_Y = 138, PHOTO_H = 632;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** Rough width check: cut long text at a word instead of letting it run off the card. */
const fit = (s: string, max: number) => {
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[s-–—·,،]+$/, "")}…`;
};
/** Right-to-left mark: makes a line that starts with a number («3 غرف») keep Arabic order. */
const RLM = "‏";

type Assets = { fonts: Uint8Array[]; logo: Uint8Array };

let ready: Promise<{
  Resvg: typeof import("@resvg/resvg-wasm").Resvg;
  decodeWebp: (b: ArrayBuffer) => Promise<ImageData>;
  encodeJpeg: (img: ImageData) => Promise<ArrayBuffer>;
}> | null = null;

/** Loads the WebAssembly modules once per server instance (imported as modules, which Cloudflare Workers require). */
function engines() {
  ready ??= (async () => {
    const resvg = await import("@resvg/resvg-wasm");
    const resvgWasm = (await import("@resvg/resvg-wasm/index_bg.wasm?module")).default;
    await resvg.initWasm(resvgWasm);
    const webp = await import("@jsquash/webp/decode.js");
    const webpWasm = (await import("@jsquash/webp/codec/dec/webp_dec.wasm?module")).default;
    await webp.init(webpWasm);
    const jpeg = await import("@jsquash/jpeg/encode.js");
    const jpegWasm = (await import("@jsquash/jpeg/codec/enc/mozjpeg_enc.wasm?module")).default;
    await jpeg.init(jpegWasm);
    return {
      Resvg: resvg.Resvg,
      decodeWebp: (b: ArrayBuffer) => webp.default(b),
      encodeJpeg: (img: ImageData) => jpeg.default(img, { quality: 86 }),
    };
  })().catch((e) => { ready = null; throw e; });
  return ready;
}

let assets: Promise<Assets> | null = null;
/** Cairo (Arabic) and the logo come from the site's own public folder. */
function loadAssets(origin: string) {
  assets ??= (async () => {
    const get = async (p: string) => {
      const r = await fetch(`${origin}${p}`);
      if (!r.ok) throw new Error(`asset ${p}: ${r.status}`);
      return new Uint8Array(await r.arrayBuffer());
    };
    const [a, b, logo] = await Promise.all([get("/fonts/Cairo-SemiBold.ttf"), get("/fonts/Cairo-ExtraBold.ttf"), get("/logo-mark.png")]);
    return { fonts: [a, b], logo };
  })().catch((e) => { assets = null; throw e; });
  return assets;
}

const b64 = (u: Uint8Array) => {
  let s = "";
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
};

function overlaySvg(f: CardFields, logo: string) {
  const T = (x: number, y: number, size: number, weight: number, fill: string, text: string, anchor = "end") =>
    `<text x="${x}" y="${y}" font-family="Cairo" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}" direction="rtl">${RLM}${esc(text)}</text>`;
  const box = (x: number, label: string, value: string, price = false) => `
    <rect x="${x}" y="890" width="322" height="92" rx="14" fill="#fff" stroke="${price ? "#1D9E75" : "#D3D1C7"}" stroke-width="${price ? 2.5 : 1.5}"/>
    ${T(x + 302, 922, 16, 600, "#5F5E5A", label)}
    ${T(x + 302, 964, value.length > 16 ? 21 : 26, 800, price ? "#0F6E56" : "#0B2545", fit(value, 24))}`;
  const chip = (x: number, w: number, text: string, color: string) => `
    <rect x="${x}" y="47" width="${w}" height="52" rx="12" fill="#F3F8FD" stroke="#B5D4F4" stroke-width="1.5"/>
    ${T(x + w / 2, 81, 20, 800, color, fit(text, 18), "middle")}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <linearGradient id="top" x1="0" x2="1"><stop offset="0" stop-color="#0B2545"/><stop offset="1" stop-color="#0F6E56"/></linearGradient>
    <linearGradient id="foot" x1="0" x2="1"><stop offset="0" stop-color="#0B2545"/><stop offset=".6" stop-color="#185FA5"/><stop offset="1" stop-color="#0F6E56"/></linearGradient>
  </defs>
  <rect width="${W}" height="${PHOTO_Y}" fill="#fff"/>
  <rect width="${W}" height="8" fill="url(#top)"/>
  <image href="${logo}" x="962" y="34" width="78" height="78"/>
  ${T(948, 80, 38, 800, "#0B2545", "فاليو عقار")}
  <text x="948" y="106" font-family="Cairo" font-size="15" font-weight="800" fill="#185FA5" text-anchor="end">VALUE AQAR • REAL ESTATE</text>
  ${chip(40, 220, f.chip, "#185FA5")}
  ${f.code ? chip(276, 200, `كود: ${f.code}`, "#0B2545") : ""}
  ${f.photo ? "" : `<rect y="${PHOTO_Y}" width="${W}" height="${PHOTO_H}" fill="#0B2545"/>${T(540, 470, 64, 800, "#5DCAA5", "فاليو عقار", "middle")}`}
  <rect x="852" y="656" width="204" height="90" rx="16" fill="#fff"/>
  <image href="${logo}" x="984" y="671" width="58" height="58"/>
  ${T(974, 705, 22, 800, "#0B2545", "فاليو عقار")}
  <text x="974" y="728" font-family="Cairo" font-size="12" font-weight="800" fill="#185FA5" text-anchor="end">VALUE AQAR</text>
  <rect y="770" width="${W}" height="236" fill="#F3F8FD"/>
  ${T(1040, 832, f.title.length > 40 ? 28 : 34, 800, "#0B2545", fit(f.title, 52))}
  <circle cx="1031" cy="861" r="7" fill="#D85A30"/>
  ${T(1016, 868, 18, 600, "#444441", fit(f.place, 80))}
  ${box(718, "السعر المطلوب", f.price, true)}
  ${box(379, "المساحة", f.size)}
  ${box(40, f.specLabel, f.spec)}
  <rect y="1006" width="${W}" height="74" fill="url(#foot)"/>
  ${T(1040, 1052, 21, 800, "#fff", "الصور والتفاصيل على فاليو عقار")}
  <text x="40" y="1052" font-family="Cairo" font-size="21" font-weight="800" fill="#fff">valueaqar.com</text>
</svg>`;
}

/** Fills the photo band of an RGBA canvas with the image, cropped to cover (bilinear-free nearest sampling is fine at this size). */
function drawCover(dst: Uint8Array, img: { width: number; height: number; data: Uint8ClampedArray | Uint8Array }) {
  const scale = Math.max(W / img.width, PHOTO_H / img.height);
  const sw = W / scale, sh = PHOTO_H / scale;
  const sx0 = (img.width - sw) / 2, sy0 = (img.height - sh) / 2;
  for (let y = 0; y < PHOTO_H; y++) {
    const sy = Math.min(img.height - 1, Math.floor(sy0 + (y + 0.5) / scale));
    for (let x = 0; x < W; x++) {
      const sx = Math.min(img.width - 1, Math.floor(sx0 + (x + 0.5) / scale));
      const s = (sy * img.width + sx) * 4, d = ((PHOTO_Y + y) * W + x) * 4;
      dst[d] = img.data[s]!; dst[d + 1] = img.data[s + 1]!; dst[d + 2] = img.data[s + 2]!; dst[d + 3] = 255;
    }
  }
}

/** Decodes the listing photo to RGBA (WebP through jsquash; JPEG / PNG through resvg as a one-image SVG). */
async function photoPixels(url: string, e: Awaited<ReturnType<typeof engines>>) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`photo ${r.status}`);
  const buf = await r.arrayBuffer();
  const head = new Uint8Array(buf, 0, 12);
  const isWebp = head[0] === 0x52 && head[1] === 0x49 && head[8] === 0x57 && head[9] === 0x45;
  if (isWebp) {
    const img = await e.decodeWebp(buf);
    return { width: img.width, height: img.height, data: img.data };
  }
  const mime = head[0] === 0x89 ? "image/png" : "image/jpeg";
  // Let resvg decode it at the band's size directly (cover crop via preserveAspectRatio).
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${PHOTO_H}"><image href="data:${mime};base64,${b64(new Uint8Array(buf))}" width="${W}" height="${PHOTO_H}" preserveAspectRatio="xMidYMid slice"/></svg>`;
  const out = new e.Resvg(svg).render();
  return { width: out.width, height: out.height, data: out.pixels };
}

/** The finished card as JPEG bytes. */
export async function renderCard(f: CardFields, origin: string): Promise<Uint8Array> {
  const [e, a] = await Promise.all([engines(), loadAssets(origin)]);
  const canvas = new Uint8Array(W * H * 4).fill(255);
  if (f.photo) {
    try {
      drawCover(canvas, await photoPixels(f.photo, e));
    } catch (err) {
      console.error("social card photo", err instanceof Error ? err.message : err);
      f = { ...f, photo: null };
    }
  }
  const overlay = new e.Resvg(overlaySvg(f, `data:image/png;base64,${b64(a.logo)}`), {
    font: { fontBuffers: a.fonts, defaultFontFamily: "Cairo", loadSystemFonts: false },
  }).render();
  const o = overlay.pixels;
  // resvg gives premultiplied-free RGBA; blend it over the photo.
  for (let i = 0; i < canvas.length; i += 4) {
    const al = o[i + 3]! / 255;
    if (al === 0) continue;
    canvas[i] = o[i]! * al + canvas[i]! * (1 - al);
    canvas[i + 1] = o[i + 1]! * al + canvas[i + 1]! * (1 - al);
    canvas[i + 2] = o[i + 2]! * al + canvas[i + 2]! * (1 - al);
  }
  // A plain object: Workers have no ImageData, and the encoder only reads data / width / height.
  const jpeg = await e.encodeJpeg({ data: new Uint8ClampedArray(canvas.buffer), width: W, height: H, colorSpace: "srgb" } as ImageData);
  return new Uint8Array(jpeg);
}
