import { App, TFile, TFolder, Notice } from "obsidian";
import { TrackerType, TrackerEntry } from "../types";

const TRACKERS_FOLDER = "Life Calendar/Trackers";

export class TrackerStore {
  private app: App;

  constructor(app: App) {
    this.app = app;
  }

  private getTrackersDir(): TFolder | null {
    const dir = this.app.vault.getAbstractFileByPath(TRACKERS_FOLDER);
    return dir instanceof TFolder ? dir : null;
  }

  private async ensureTrackersFolder(): Promise<TFolder> {
    let dir = this.app.vault.getAbstractFileByPath(TRACKERS_FOLDER);
    if (!(dir instanceof TFolder)) {
      try {
        await this.app.vault.createFolder(TRACKERS_FOLDER);
      } catch {
        // папка уже создана
      }
      dir = this.app.vault.getAbstractFileByPath(TRACKERS_FOLDER);
    }
    if (!(dir instanceof TFolder)) {
      throw new Error("Life Calendar: папка трекеров не найдена");
    }
    return dir;
  }

  private async getFileForType(type: TrackerType): Promise<TFile> {
    const folder = await this.ensureTrackersFolder();
    const extMap: Record<TrackerType, string> = {
      books: "books.json",
      exercises: "exercises.json",
      tasks: "tasks.json",
    };
    const path = `${folder.path}/${extMap[type]}`;
    let file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      try {
        await this.app.vault.create(path, JSON.stringify({ version: 1, entries: [] }) + "\n");
      } catch {
        // игнорируем ошибки создания
      }
      file = this.app.vault.getAbstractFileByPath(path);
    }
    if (!(file instanceof TFile)) {
      throw new Error(`Life Calendar: файл трекера ${type} не найден`);
    }
    return file;
  }

  async loadEntries(type: TrackerType): Promise<TrackerEntry[]> {
    try {
      const file = await this.getFileForType(type);
      if (!file) return [];
      const content = await this.app.vault.read(file);
      const data = JSON.parse(content) as { version?: number; entries?: TrackerEntry[] };
      return data.entries ?? [];
    } catch (e) {
      console.error(`Life Calendar: error loading ${type} entries`, e);
      return [];
    }
  }

  async saveEntries(type: TrackerType, entries: TrackerEntry[]): Promise<void> {
    try {
      const file = await this.getFileForType(type);
      const content = JSON.stringify({ version: 1, entries }, null, 2) + "\n";
      await this.app.vault.modify(file, content);
    } catch (e) {
      console.error(`Life Calendar: error saving ${type} entries`, e);
      new Notice(`Life Calendar: ошибка сохранения ${type}`);
    }
  }

  async addEntry(type: TrackerType, entry: Omit<TrackerEntry, 'id' | 'date' | 'createdAt'>): Promise<TrackerEntry> {
    const now = new Date();
    const entries = await this.loadEntries(type);

    const newEntry: TrackerEntry = {
      id: `entry_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      type,
      title: entry.title,
      date: now.toISOString().split("T")[0],
      createdAt: now.toISOString(),
      extra: entry.extra,
    };

    entries.push(newEntry);
    await this.saveEntries(type, entries);
    return newEntry;
  }

  async updateEntry(type: TrackerType, id: string, updates: Partial<TrackerEntry>): Promise<void> {
    const entries = await this.loadEntries(type);
    const idx = entries.findIndex((e) => e.id === id);
    if (idx === -1) return;

    entries[idx] = { ...entries[idx], ...updates };
    await this.saveEntries(type, entries);
  }

  async removeEntry(type: TrackerType, id: string): Promise<void> {
    let entries = await this.loadEntries(type);
    entries = entries.filter((e) => e.id !== id);
    await this.saveEntries(type, entries);
  }

  async getAllEntries(): Promise<Map<TrackerType, TrackerEntry[]>> {
    const types: TrackerType[] = ['books', 'exercises', 'tasks'];
    const result = new Map<TrackerType, TrackerEntry[]>();
    for (const type of types) {
      result.set(type, await this.loadEntries(type));
    }
    return result;
  }
}