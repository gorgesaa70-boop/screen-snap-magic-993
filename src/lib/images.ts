/**
 * Image preparation before upload: phone photos (often 4–12 MB, sometimes rotated) are decoded, turned upright,
 * resized to at most 1600px and re-encoded as WebP (JPEG on browsers that can't encode WebP; PNG keeps transparency).
 * Each photo also gets a 640px card copy, see thumb().
 * Errors come back as short Arabic messages ready for a toast.
 */

export const MAX_INPUT_MB = 30;
const HEIC = /\.(heic|heif)$/i;

export class UploadError extends Error {}

function isImage(file: File) {
  return file.type.startsWith("image/") || HEIC.test(file.name) || /\.(jpe?g|png|webp|gif|bmp)$/i.test(file.name);
}

async function decode(file: File): Promise<CanvasImageSource & { width: number; height: number; close?: () => void }> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // Older browsers: fall back to an <img> element.
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.decoding = "async";
      img.src = url;
      await img.decode();
      return Object.assign(img, { width: img.naturalWidth, height: img.naturalHeight });
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

function hasAlpha(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const step = Math.max(1, Math.floor(Math.min(w, h) / 40));
  const data = ctx.getImageData(0, 0, w, h).data;
  for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) if (data[(y * w + x) * 4 + 3]! < 250) return true;
  return false;
}

const toBlob = (canvas: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

/** Decode, orient, resize and re-encode an image file. Throws UploadError with an Arabic message. */
export async function prepareImage(file: File, maxSide = 1600, quality = 0.82): Promise<Blob> {
  if (!isImage(file)) throw new UploadError("الملف ده مش صورة — اختار صورة JPG أو PNG");
  if (file.size > MAX_INPUT_MB * 1024 * 1024) throw new UploadError(`الصورة كبيرة جدًا (أكتر من ${MAX_INPUT_MB} ميجا)`);
  let src: Awaited<ReturnType<typeof decode>>;
  try {
    src = await decode(file);
  } catch {
    throw new UploadError(HEIC.test(file.name) || /hei[cf]/i.test(file.type)
      ? "صيغة صور الآيفون (HEIC) مش مدعومة في المتصفح ده — من الموبايل اختار الصورة من الألبوم، أو حوّلها لـ JPG"
      : "الصورة دي مش بتفتح — جرّب صورة تانية");
  }
  const scale = Math.min(1, maxSide / Math.max(src.width, src.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(src.width * scale));
  canvas.height = Math.max(1, Math.round(src.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new UploadError("المتصفح مش قادر يجهّز الصورة — جرّب متصفح تاني");
  ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
  src.close?.();
  const transparent = file.type !== "image/jpeg" && hasAlpha(ctx, canvas.width, canvas.height);
  // Some browsers silently return PNG when asked for WebP, so check the type that came back.
  const webp = await toBlob(canvas, "image/webp", quality);
  const blob = webp?.type === "image/webp" ? webp
    : transparent ? await toBlob(canvas, "image/png", 1)
    : await toBlob(canvas, "image/jpeg", quality);
  if (!blob) throw new UploadError("تعذّر تجهيز الصورة — جرّب صورة تانية");
  return blob;
}

/** Card copies are 640px: sharp on phones, about a fifth of the full photo. */
export const THUMB_SIDE = 640;
const THUMB_MARK = "#sm=";

/** Photo URL that also carries its card copy. The part after # is never sent to the server, so the full photo still loads normally. */
export const withThumb = (url: string, small: string) => `${url}${THUMB_MARK}${encodeURIComponent(small)}`;

/** The card-size copy of a photo when it has one, else the photo itself. */
export function thumb<T extends string | null | undefined>(url: T): T {
  if (!url) return url;
  const i = url.indexOf(THUMB_MARK);
  return (i < 0 ? url : decodeURIComponent(url.slice(i + THUMB_MARK.length))) as T;
}

export const hasThumb = (url: string) => url.includes(THUMB_MARK);

export const extensionFor = (type: string) => (type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg");

/** Storage / network errors → Arabic. */
export function uploadErrorMessage(e: unknown): string {
  if (e instanceof UploadError) return e.message;
  const msg = String((e as { message?: string })?.message ?? e ?? "");
  if (/row-level security|unauthorized|jwt|not authenticated|403/i.test(msg)) return "انتهت جلسة الدخول — سجّل دخول تاني وجرّب";
  if (/payload too large|exceeded the maximum|413|too large/i.test(msg)) return "الملف كبير على المساحة المسموحة — جرّب ملف أصغر";
  if (/mime|invalid.*type|not allowed/i.test(msg)) return "نوع الملف ده مش مسموح";
  if (/bucket not found/i.test(msg)) return "مكان حفظ الصور مش متجهّز — بلّغ الإدارة";
  if (/failed to fetch|network|timeout/i.test(msg)) return "النت فصل أثناء الرفع — جرّب تاني";
  return msg ? `تعذّر رفع الملف: ${msg}` : "تعذّر رفع الملف";
}

/** Images inside document uploads (deal papers, payment proofs) are shrunk too; PDFs pass through. */
export async function prepareDocument(file: File): Promise<{ body: Blob; type: string; name: string }> {
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) return { body: file, type: "application/pdf", name: file.name };
  const blob = await prepareImage(file, 2000, 0.85);
  return { body: blob, type: blob.type, name: file.name.replace(/\.[^.]+$/, "") + "." + extensionFor(blob.type) };
}
