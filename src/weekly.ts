import { App, TFile } from "obsidian";
import { JournalEntry, LifeCalendarSettings } from "./types";
import { keyToDmy, weekdayName, dmyToKey, pad } from "./util";

interface Section {
  date: string;
  lines: string[];
}

const WEEK_HEAD_RE = /^#\s+\d{1,2}\.\d{1,2}\.\d{4}\s+—\s+неделя/m;
const SECTION_RE = /^###\s+(\d{1,2})\.(\d{1,2})\.(\d{4})/;

export class WeekStore {
  constructor(
    private app: App,
    private getSettings: () => LifeCalendarSettings,
  ) {}

  get folder(): string {
    return this.getSettings().weeklyFolder;
  }

  pathFor(weekKey: string): string {
    return this.folder + "/" + keyToDmy(weekKey) + ".md";
  }

  isWeekNote(content: string): boolean {
    return WEEK_HEAD_RE.test(content);
  }

  buildWeek(weekKey: string, entries: JournalEntry[]): string {
    const lines: string[] = [`# ${keyToDmy(weekKey)} — неделя`, ""];
    const sources = new Set<string>();
    if (entries.length) {
      lines.push("## Журнал", "");
      for (const j of entries) {
        lines.push(`### ${keyToDmy(j.date)} (${weekdayName(j.date)})`, "");
        lines.push(j.text.trim(), "");
        sources.add(j.path);
      }
    }
    lines.push("## Источник", "");
    for (const s of [...sources].sort()) lines.push("- " + s);
    return lines.join("\n") + "\n";
  }

  extractSections(content: string): Section[] {
    const sections: Section[] = [];
    let cur: Section | null = null;
    for (const ln of content.split(/\r?\n/)) {
      const m = SECTION_RE.exec(ln);
      if (m) {
        cur = { date: m[3] + "-" + pad(+m[2]) + "-" + pad(+m[1]), lines: [] };
        sections.push(cur);
        continue;
      }
      if (/^#{1,6}\s/.test(ln)) {
        cur = null;
        continue;
      }
      if (cur) cur.lines.push(ln);
    }
    return sections;
  }

  private sectionKey(s: Section): string {
    return s.date + "|" + s.lines.join(" ").replace(/\s+/g, " ").trim();
  }

  /**
   * Открыть недельную заметку: пересобрать агрегат (сохранив ручные секции)
   * или создать новый из записей недели.
   * Возвращает TFile, готовый к открытию.
   */
  async getOrCreateWeek(weekKey: string, entries: JournalEntry[]): Promise<TFile | null> {
    const path = this.pathFor(weekKey);
    const existing = this.app.vault.getAbstractFileByPath(path) as TFile | null;
    if (existing) {
      const content = await this.app.vault.read(existing);
      if (this.isWeekNote(content)) {
        const rebuilt = this.buildWeek(weekKey, entries);
        const merged = this.mergeManualSections(content, rebuilt);
        if (merged !== content) {
          await this.app.vault.modify(existing, merged);
        }
      }
      return existing;
    }
    if (!entries.length) return null;
    const content = this.buildWeek(weekKey, entries);
    return this.app.vault.create(path, content);
  }

  private mergeManualSections(existing: string, rebuilt: string): string {
    const newSections = this.extractSections(rebuilt);
    const newKeys = new Set(newSections.map((s) => this.sectionKey(s)));
    const newByDate = new Map<string, Section>();
    for (const s of newSections) if (!newByDate.has(s.date)) newByDate.set(s.date, s);
    const norm = (t: string) => t.toLowerCase().replace(/\s+/g, " ").trim();
    const extra = this.extractSections(existing).filter((s) => {
      if (newKeys.has(this.sectionKey(s))) return false;
      const rebuiltSec = newByDate.get(s.date);
      if (rebuiltSec) {
        const ns = norm(s.lines.join(" "));
        if (ns && norm(rebuiltSec.lines.join(" ")).includes(ns)) return false;
      }
      return true;
    });
    if (!extra.length) return rebuilt;
    const blocks = extra
      .map((s) => `### ${keyToDmy(s.date)} (${weekdayName(s.date)})\n\n${s.lines.join("\n").trim()}`)
      .join("\n\n");
    return rebuilt.replace(/\n## Источник/, "\n" + blocks + "\n\n## Источник");
  }
}
