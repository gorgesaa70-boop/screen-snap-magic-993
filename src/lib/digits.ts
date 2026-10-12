/**
 * Arabic phone keyboards type ٠١٢٣٤٥٦٧٨٩ (and Persian ۰-۹). Number inputs strip non-digits, which used to
 * delete those digits so the field looked like it "doesn't type". Convert them to 0-9 first.
 */
export const ARABIC_DIGITS = /[٠-٩۰-۹]/g;

/** ٣ → "3", ۷ → "7" (both ranges start at a code point divisible by 16). */
export const latinDigit = (d: string) => String(d.charCodeAt(0) % 16);

/** Whole string: Arabic/Persian digits → 0-9, Arabic decimal separator ٫ → "." */
export const toLatinDigits = (s: string) => s.replace(ARABIC_DIGITS, latinDigit).replace(/٫/g, ".");
