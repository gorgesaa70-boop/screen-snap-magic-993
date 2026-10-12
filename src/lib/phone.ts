import { ARABIC_DIGITS, latinDigit } from "@/lib/digits";

/**
 * A phone typed in a form, cleaned for saving, or null if it can't be a real number.
 * Egyptian mobiles (01x, +201x, 00201x — Arabic digits OK) become 01XXXXXXXXX.
 * Other countries must start with + or 00 and come back as +<8–15 digits>.
 */
export function cleanPhone(raw: string): string | null {
  const s = (raw || "").trim();
  let d = s.replace(ARABIC_DIGITS, latinDigit).replace(/\D/g, "");
  const intl = s.startsWith("+") || d.startsWith("00");
  if (d.startsWith("00")) d = d.slice(2);
  if (/^(20)?1[0125]\d{8}$/.test(d) || /^01[0125]\d{8}$/.test(d)) return "0" + d.slice(-10);
  if (intl && !d.startsWith("20") && /^[1-9]\d{7,14}$/.test(d)) return "+" + d;
  return null;
}
