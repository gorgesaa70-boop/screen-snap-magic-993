/** Working-time maths for response alerts — mirrors public.work_minutes() in the database (Cairo time). */

export type WorkHours = { start: number; end: number };
export const DEFAULT_HOURS: WorkHours = { start: 9, end: 21 };

/** Minutes Cairo is ahead of UTC at a given instant (handles daylight saving). */
function cairoOffset(ms: number): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: "Africa/Cairo", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
      .formatToParts(new Date(ms)).filter((p) => p.type !== "literal").map((p) => [p.type, Number(p.value)]),
  );
  const n = (k: string) => parts[k] ?? 0;
  return (Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute")) - Math.floor(ms / 60000) * 60000) / 60000;
}

/** UTC instant of a Cairo wall-clock time. */
function cairoToUtc(y: number, m: number, d: number, h: number): number {
  const guess = Date.UTC(y, m, d, h);
  return guess - cairoOffset(guess - cairoOffset(guess) * 60000) * 60000;
}

/** Minutes between two instants that fall inside working hours, every day. */
export function workMinutes(from: string | number | Date, to: string | number | Date, hours: WorkHours = DEFAULT_HOURS): number {
  const a = new Date(from).getTime(); const b = new Date(to).getTime();
  if (!(b > a)) return 0;
  const local = new Date(a + cairoOffset(a) * 60000);
  let y = local.getUTCFullYear(), m = local.getUTCMonth(), d = local.getUTCDate();
  let total = 0;
  for (let i = 0; i < 400; i++) {
    const s = cairoToUtc(y, m, d, hours.start); const e = cairoToUtc(y, m, d, hours.end);
    if (s > b) break;
    total += Math.max(0, Math.min(b, e) - Math.max(a, s)) / 60000;
    const next = new Date(Date.UTC(y, m, d + 1)); y = next.getUTCFullYear(); m = next.getUTCMonth(); d = next.getUTCDate();
  }
  return Math.round(total);
}

/** "45 دقيقة" / "3 ساعات و10 دقايق" for working minutes. */
export function formatWorkMinutes(mins: number): string {
  if (mins < 60) return `${mins} دقيقة`;
  const h = Math.floor(mins / 60); const r = mins % 60;
  const hs = h === 1 ? "ساعة" : h === 2 ? "ساعتين" : h <= 10 ? `${h} ساعات` : `${h} ساعة`;
  return r ? `${hs} و${r} دقيقة` : hs;
}
