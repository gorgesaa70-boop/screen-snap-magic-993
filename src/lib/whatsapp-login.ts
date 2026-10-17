import { ARABIC_DIGITS, latinDigit } from "@/lib/digits";
// Pure helpers for "send us the code" WhatsApp sign-in (no secrets, no DB) — shared by the site and the webhook.

/** Value Aqar's WhatsApp Cloud API number: customers send their sign-in code to it. Only linked, never printed. */
export const WHATSAPP_LOGIN_NUMBER = "201011125243";

export const loginMessage = (code: string) => `كود الدخول لفاليو عقار: ${code}`;

export const loginLink = (code: string) => `https://wa.me/${WHATSAPP_LOGIN_NUMBER}?text=${encodeURIComponent(loginMessage(code))}`;

/** Every 6-digit group in a message (Arabic digits and spaces/dashes inside the group accepted), at most 3. */
export function extractLoginCodes(text: string | null | undefined): string[] {
  const t = (text ?? "").replace(ARABIC_DIGITS, latinDigit);
  const out = new Set<string>();
  for (const m of t.matchAll(/(?<!\d)(\d(?:[\s-]?\d){5})(?![\s-]?\d)/g)) {
    out.add(m[1]!.replace(/\D/g, ""));
    if (out.size >= 3) break;
  }
  return [...out];
}
