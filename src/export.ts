import { App, TFile } from "obsidian";
import { BackupData, JournalEntry, LifeCalendarSettings, LifeEvent } from "./types";

/** Экспорт в формат приложения Life Calendar (Android) — BackupManager. */
export class ExportManager {
  constructor(
    private app: App,
    private getSettings: () => LifeCalendarSettings,
  ) {}

  /**
   * @param entries записи дневника
   * @param events события
   * @returns строка JSON в формате BackupData
   */
  buildJson(entries: JournalEntry[], events: LifeEvent[]): string {
    const s = this.getSettings();
    const data: BackupData = {
      version: 1,
      birthDate: s.birthDate,
      lifespanYears: s.lifespanYears,
      entries: entries.map((e) => ({ date: e.date, text: e.text })),
      events: events.map((e) => ({ date: e.date, title: e.title, color: argb(e.color) })),
    };
    return JSON.stringify(data, null, 2) + "\n";
  }

  async writeBackup(json: string): Promise<string> {
    const path = this.getSettings().exportFile;
    const file = this.app.vault.getAbstractFileByPath(path) as TFile | null;
    if (file) {
      await this.app.vault.modify(file, json);
      return path;
    }
    const dir = path.replace(/[^/]+$/, "").replace(/\/$/, "");
    if (dir && !this.app.vault.getAbstractFileByPath(dir)) {
      try {
        await this.app.vault.createFolder(dir);
      } catch (e) {
        // уже создана
      }
    }
    await this.app.vault.create(path, json);
    return path;
  }
}

/** "#rrggbb" -> 0xFFrrggbb (ARGB Long, как хранит Android). */
export function argb(hex: string): number {
  let c = hex.trim().replace(/^#/, "");
  if (c.length === 3) c = c.split("").map((x) => x + x).join("");
  return 0xff000000 | (parseInt(c, 16) || 0);
}
