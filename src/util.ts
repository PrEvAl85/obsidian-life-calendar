import { App } from "obsidian";
import { dayName, monthNameGen } from "./i18n";
import { dayIndexOfKey, mondayKeyOf as mondayOfKey } from "./date";

export function pad(n: number): string {
  return (n < 10 ? "0" : "") + n;
}

/** Гарантирует существование родительской папки файла (создаёт вложенные). */
export async function ensureFolder(app: App, filePath: string): Promise<void> {
  const dir = filePath.replace(/[^/]+$/, "").replace(/\/$/, "");
  if (!dir) return;
  const folder = app.vault.getAbstractFileByPath(dir);
  if (!folder) {
    try {
      await app.vault.createFolder(dir);
    } catch {
      // Папка могла создаться параллельно
    }
  }
}

export function fmtKey(y: number, m: number, d: number): string {
  return y + "-" + pad(m) + "-" + pad(d);
}

/** Ключ недели (понедельник YYYY-MM-DD) по ключу даты. */
export function weekKeyOf(dateKey: string): string {
  return mondayOfKey(dateKey);
}

/** DD.MM.YYYY (имя файла) -> YYYY-MM-DD (ключ). */
export function dmyToKey(dmy: string): string {
  const p = dmy.split(".");
  return p[2] + "-" + p[1] + "-" + p[0];
}

/** YYYY-MM-DD (ключ) -> DD.MM.YYYY (имя файла). */
export function keyToDmy(key: string): string {
  const p = key.split("-");
  return pad(+p[2]) + "." + pad(+p[1]) + "." + p[0];
}

export const RU_WEEKDAYS = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];

export function weekdayName(dateKey: string): string {
  return dayName(dayIndexOfKey(dateKey));
}

export function formatRuDate(y: number, m: number, d: number): string {
  return +d + " " + monthNameGen(m - 1) + " " + y;
}

export function escRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Извлечение текста записи дня: убирает frontmatter, H1, раздел «Источник», разделители. */
export function cleanNoteText(content: string): string {
  let text = content.replace(/^\s*<!--.*?-->\s*/s, "");
  const fm = /^---\s*\n.*?\n---\s*\n?/s.exec(text);
  if (fm) text = text.slice(fm[0].length);
  text = text.replace(/^#\s+[^\n]*\n+/m, "");
  text = text.replace(/(^|\n)##\s+(Источник|Source)[^\n]*(?:\n[ \t]*-[^\n]*)*\n*/g, "");
  text = text.replace(/^[ \t]*---\s*$/gm, "\n");
  text = text.replace(/!\[\[[^\]]+\]\]/g, "");
  text = text.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2");
  text = text.replace(/\[\[([^\]]+)\]\]/g, (_, x: string) => x.split("#", 1)[0].trim());
  text = text.replace(/(?<![\w])#[\wа-яё][\wа-яё-]*/g, "");
  text = text.replace(/^[ \t]+/gm, "");
  text = text.replace(/[ \t]+/g, " ");
  text = text.replace(/\n\s*\n\s*\n+/g, "\n\n");
  return text.trim();
}
