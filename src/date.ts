/** Лёгкие утилиты работы с датами. Ключ даты — строка "YYYY-MM-DD". */

export function pad(n: number): string {
  return (n < 10 ? "0" : "") + n;
}

/** Валидность ключа даты (формат + реальность календарной даты). */
export function isValidKey(key: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Сегодня в локальном времени как ключ "YYYY-MM-DD". */
export function todayKey(): string {
  const now = new Date();
  return now.getFullYear() + "-" + pad(now.getMonth() + 1) + "-" + pad(now.getDate());
}

/** Год из ключа даты. */
export function yearOf(key: string): number {
  return +key.slice(0, 4);
}

/** Часть "MM-DD" из ключа даты. */
export function monthDayOf(key: string): string {
  return key.slice(5);
}

/** Сдвиг ключа даты на n дней. */
export function addDays(key: string, n: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return dt.getFullYear() + "-" + pad(dt.getMonth() + 1) + "-" + pad(dt.getDate());
}

/** Сдвиг ключа даты на n лет (29 февраля в невисокосный год → 28 февраля). */
export function addYears(key: string, n: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setFullYear(dt.getFullYear() + n);
  if (dt.getDate() !== d) dt.setDate(0);
  return dt.getFullYear() + "-" + pad(dt.getMonth() + 1) + "-" + pad(dt.getDate());
}

/** Целое число дней: b - a (знак сохраняется). */
export function diffDays(a: string, b: string): number {
  const [y1, m1, d1] = a.split("-").map(Number);
  const [y2, m2, d2] = b.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

/** Полных лет между a (дата рождения) и b. */
export function diffYears(a: string, b: string): number {
  const [y1, m1, d1] = a.split("-").map(Number);
  const [y2, m2, d2] = b.split("-").map(Number);
  let years = y2 - y1;
  if (m2 < m1 || (m2 === m1 && d2 < d1)) years--;
  return years;
}

/** Индекс дня недели (0 = воскресенье, как Date.getDay() / moment.day()). */
export function dayIndexOfKey(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
}

/** Понедельник недели (ключ даты), к которой относится dateKey. */
export function mondayKeyOf(dateKey: string): string {
  const wd = (dayIndexOfKey(dateKey) + 6) % 7; // 0 = понедельник
  return addDays(dateKey, -wd);
}

/** Форматирование ключа: "DD.MM.YYYY" (short=false) или "DD.MM.YY". */
export function formatKey(key: string, short = false): string {
  const y = key.slice(0, 4);
  const m = key.slice(5, 7);
  const d = key.slice(8, 10);
  return d + "." + m + "." + (short ? y.slice(2) : y);
}
