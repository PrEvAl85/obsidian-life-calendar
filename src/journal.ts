import { App, TFile } from "obsidian";
import { JournalEntry, LifeCalendarSettings } from "./types";
import { cleanNoteText, keyToDmy, pad } from "./util";

const FILE_RE = /^(\d{1,2})\.(\d{1,2})\.(\d{4})\.md$/;

export class JournalStore {
  constructor(
    private app: App,
    private getSettings: () => LifeCalendarSettings,
  ) {}

  get folder(): string {
    return this.getSettings().journalFolder;
  }

  pathFor(dateKey: string): string {
    return this.folder + "/" + keyToDmy(dateKey) + ".md";
  }

  files(): TFile[] {
    return this.app.vault
      .getFiles()
      .filter((f) => f.path.startsWith(this.folder + "/") && f.path.endsWith(".md") && FILE_RE.test(f.name));
  }

  async listAll(): Promise<JournalEntry[]> {
    const out: JournalEntry[] = [];
    const files = this.files();
    const contents = await Promise.all(files.map((f) => this.app.vault.read(f)));
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const m = FILE_RE.exec(f.name);
      if (!m) continue;
      const date = m[3] + "-" + pad(+m[2]) + "-" + pad(+m[1]);
      const text = cleanNoteText(contents[i]);
      if (text) out.push({ date, text, path: f.path });
    }
    return out;
  }

  /** Записи за неделю (понедельник weekKey). */
  async getWeek(weekKey: string): Promise<JournalEntry[]> {
    const all = await this.listAll();
    return all.filter((e) => this.weekOf(e.date) === weekKey);
  }

  async hasEntryInWeek(weekKey: string): Promise<boolean> {
    return (await this.getWeek(weekKey)).length > 0;
  }

  /** Добавление записи за дату: дополняет файл дня или создаёт новый. */
  async addEntry(dateKey: string, text: string): Promise<string> {
    const path = this.pathFor(dateKey);
    const file = this.app.vault.getAbstractFileByPath(path) as TFile | null;
    if (file) {
      const existing = await this.app.vault.read(file);
      const content = existing.replace(/\s*$/, "") + "\n\n---\n\n" + text.trim() + "\n";
      await this.app.vault.modify(file, content);
      return path;
    }
    const p = dateKey.split("-");
    const y = +p[0];
    const m = +p[1];
    const d = +p[2];
    const header = "# " + d + " " + this.ruMonthGen(m) + " " + y;
    await this.app.vault.create(path, header + "\n\n" + text.trim() + "\n");
    return path;
  }

  private ruMonthGen(m: number): string {
    const names = [
      "января", "февраля", "марта", "апреля", "мая", "июня",
      "июля", "августа", "сентября", "октября", "ноября", "декабря",
    ];
    return names[m - 1] || String(m);
  }

  private weekOf(dateKey: string): string {
    const mom = window.moment(dateKey, "YYYY-MM-DD");
    const wd = (mom.day() + 6) % 7;
    return mom.clone().subtract(wd, "days").format("YYYY-MM-DD");
  }
}
