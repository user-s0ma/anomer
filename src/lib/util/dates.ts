/** 日付は YYYY-MM-DD の文字列で扱う */

export function addDays(date: string, days: number) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

export function daysBetween(start: string, end: string) {
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000);
}

/** start〜end (どちらも含む) の日付 */
export function dateRange(start: string, end: string) {
  return Array.from({ length: daysBetween(start, end) + 1 }, (_, i) => addDays(start, i));
}

/** そのタイムゾーンでの今日 */
export function todayIn(timezone: string, now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
