/** One CSV cell: quotes when needed and neutralizes text starting with = + - @ (tab/CR) so spreadsheets never run it as a formula. */
export function csvCell(v: unknown): string {
  if (v == null) return "";
  let t = String(v);
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(t)) t = "'" + t;
  return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}
