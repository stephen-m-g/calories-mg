function dateToYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Local calendar date as YYYY-MM-DD (not UTC — a "day" should match the user's wall clock). */
export function todayYmd(): string {
  return dateToYmd(new Date());
}

/** Adds (or subtracts, if negative) whole days to a YYYY-MM-DD date. */
export function shiftYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return dateToYmd(new Date(y, m - 1, d + days));
}

/** Start/end ISO bounds (local time, expressed as local Date -> ISO) for a given YYYY-MM-DD day. */
export function dayBoundsIso(ymd: string): { startIso: string; endIso: string } {
  const [y, m, d] = ymd.split('-').map(Number);
  const start = new Date(y, m - 1, d, 0, 0, 0, 0);
  const end = new Date(y, m - 1, d, 23, 59, 59, 999);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

const MONTH_ABBR = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/** "Today" for the current day, else an abbreviated date like "Aug 5". */
export function formatHeaderDate(ymd: string): string {
  if (ymd === todayYmd()) return 'Today';
  const [, m, d] = ymd.split('-').map(Number);
  return `${MONTH_ABBR[m - 1]} ${d}`;
}

/** The Sunday (YYYY-MM-DD) that starts the week containing the given date. */
export function startOfWeekYmd(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dayOfWeek = new Date(y, m - 1, d).getDay(); // 0 = Sunday
  return shiftYmd(ymd, -dayOfWeek);
}

/** The 7 YYYY-MM-DD dates (Sunday→Saturday) of the week containing the given date. */
export function getWeekDates(ymd: string): string[] {
  const start = startOfWeekYmd(ymd);
  return Array.from({ length: 7 }, (_, i) => shiftYmd(start, i));
}
