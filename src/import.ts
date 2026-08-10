import type { App } from "obsidian";
import { BackupData, LIFESPAN_MAX, LIFESPAN_MIN, LifeCalendarSettings } from "./types";
import { isValidKey } from "./date";
import type { JournalStore } from "./journal";
import type { EventsStore } from "./events";

/** Ошибка неверного формата файла резервной копии. */
export class InvalidBackupError extends Error {}

export interface ImportResult {
  entriesAdded: number;
  entriesSkipped: number;
  eventsAdded: number;
  eventsSkipped: number;
  metaApplied: boolean;
}

/**
 * Импорт резервной копии (формат приложения Life Calendar — BackupManager).
 * Файл, созданный кнопкой «Экспорт», можно импортировать и в Android,
 * и в другой vault Obsidian.
 */
export class ImportManager {
  constructor(
    private app: App,
    private getSettings: () => LifeCalendarSettings,
    private saveSettings: () => Promise<void>,
    private journal: JournalStore,
    private events: EventsStore,
  ) {}

  /**
   * Разбор и валидация JSON-файла резервной копии.
   * @throws InvalidBackupError при неверном формате.
   */
  parse(json: string): BackupData {
    let obj: unknown;
    try {
      obj = JSON.parse(json);
    } catch {
      throw new InvalidBackupError();
    }
    if (!obj || typeof obj !== "object") throw new InvalidBackupError();
    const d = obj as Partial<BackupData>;
    if (!Array.isArray(d.entries) || !Array.isArray(d.events)) throw new InvalidBackupError();
    return {
      version: 1,
      birthDate: typeof d.birthDate === "string" ? d.birthDate : "",
      lifespanYears: typeof d.lifespanYears === "number" ? d.lifespanYears : 100,
      entries: d.entries,
      events: d.events,
    };
  }

  /**
   * Импорт данных в vault: записи дневника и события дополняются без дублей,
   * при applyMeta применяются дата рождения и срок жизни из файла.
   */
  async importBackup(data: BackupData, applyMeta: boolean): Promise<ImportResult> {
    const s = this.getSettings();

    let metaApplied = false;
    if (applyMeta && isValidKey(data.birthDate)) {
      s.birthDate = data.birthDate;
      if (typeof data.lifespanYears === "number") {
        s.lifespanYears = Math.min(LIFESPAN_MAX, Math.max(LIFESPAN_MIN, Math.round(data.lifespanYears)));
      }
      await this.saveSettings();
      metaApplied = true;
    }

    const existing = await this.journal.listAll();
    const seen = new Set(existing.map((e) => e.date + "\u0000" + e.text));
    let entriesAdded = 0;
    let entriesSkipped = 0;
    for (const entry of data.entries) {
      const date = entry?.date;
      const text = typeof entry?.text === "string" ? entry.text.trim() : "";
      if (!isValidKey(date) || !text) {
        entriesSkipped++;
        continue;
      }
      const key = date + "\u0000" + text;
      if (seen.has(key)) {
        entriesSkipped++;
        continue;
      }
      await this.journal.addEntry(date, text);
      seen.add(key);
      entriesAdded++;
    }

    const evs = await this.events.read();
    const evSeen = new Set(evs.map((e) => e.date + "\u0000" + e.title));
    let eventsAdded = 0;
    let eventsSkipped = 0;
    const merged = [...evs];
    for (const b of data.events) {
      const date = b?.date;
      const title = typeof b?.title === "string" ? b.title.trim() : "";
      if (!isValidKey(date) || !title) {
        eventsSkipped++;
        continue;
      }
      const key = date + "\u0000" + title;
      if (evSeen.has(key)) {
        eventsSkipped++;
        continue;
      }
      merged.push({ date, title, color: normalizeColor(b?.color) });
      evSeen.add(key);
      eventsAdded++;
    }
    if (eventsAdded) {
      merged.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
      await this.events.write(merged);
    }

    return { entriesAdded, entriesSkipped, eventsAdded, eventsSkipped, metaApplied };
  }
}

/** 0xFFrrggbb (ARGB Long, как хранит Android) -> "#rrggbb". */
export function argbToHex(color: number): string {
  if (!Number.isFinite(color)) return "#d22";
  return "#" + ((color & 0xffffff) >>> 0).toString(16).padStart(6, "0");
}

function normalizeColor(c: unknown): string {
  if (typeof c === "number") return argbToHex(c);
  if (typeof c === "string") {
    let h = c.trim().replace(/^#/, "");
    if (/^[0-9a-fA-F]{3}$/.test(h)) h = h.split("").map((x) => x + x).join("");
    if (/^[0-9a-fA-F]{6}$/.test(h)) return "#" + h.toLowerCase();
    if (/^[0-9a-fA-F]{8}$/.test(h)) return "#" + h.slice(0, 6).toLowerCase();
  }
  return "#d22";
}
