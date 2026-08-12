import { App, TFile } from "obsidian";
import { JournalEntry, LifeCalendarSettings } from "./types";
import { cleanNoteText, cleanNoteTextForDisplay, ensureFolder, keyToDmy, pad } from "./util";
import { monthNameGen } from "./i18n";
import { mondayKeyOf } from "./date";

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
      out.push(...this.parseDay(date, contents[i], f.path));
    }
    return out;
  }

  /** Все записи одного дня с индексами внутри файла. */
  async listDay(dateKey: string): Promise<JournalEntry[]> {
    const path = this.pathFor(dateKey);
    const file = this.app.vault.getAbstractFileByPath(path) as TFile | null;
    if (!file) return [];
    const content = await this.app.vault.read(file);
    return this.parseDay(dateKey, content, file.path);
  }

  private parseDay(dateKey: string, content: string, path: string): JournalEntry[] {
    const { blocks } = splitDayFile(content);
    const out: JournalEntry[] = [];
    for (let i = 0; i < blocks.length; i++) {
      const text = cleanNoteText(blocks[i]);
      const rawText = cleanNoteTextForDisplay(blocks[i]);
      if (text || rawText) out.push({ date: dateKey, text, rawText, path, index: i, blocks: blocks.length });
    }
    return out;
  }

  /** Записи за неделю (понедельник weekKey). */
  async getWeek(weekKey: string): Promise<JournalEntry[]> {
    const all = await this.listAll();
    return all.filter((e) => this.weekOf(e.date) === weekKey);
  }

  /** Проверка, является ли текст пустым или только whitespace. */
  private isEmptyText(text: string): boolean {
    return !text || text.trim().length === 0;
  }

  async hasEntryInWeek(weekKey: string): Promise<boolean> {
    return (await this.getWeek(weekKey)).length > 0;
  }

  /** Добавление записи за дату: дополняет файл дня или создаёт новый. */
  async addEntry(dateKey: string, text: string, rawText?: string): Promise<string> {
    const path = this.pathFor(dateKey);
    const file = this.app.vault.getAbstractFileByPath(path) as TFile | null;
    if (file) {
      const existing = await this.app.vault.read(file);
      const content = existing.replace(/\s*$/m, "") + "\n\n---\n\n" + text.trim() + "\n";
      await this.app.vault.modify(file, content);
      return path;
    }
    const p = dateKey.split("-") as [string, string, string];
    const y = +p[0];
    const m = +p[1];
    const d = +p[2];
    const header = "# " + d + " " + monthNameGen(m - 1) + " " + y;
    await ensureFolder(this.app, path);
    await this.app.vault.create(path, header + "\n\n" + (rawText !== undefined ? rawText.trim() : text.trim()) + "\n");
    return path;
  }

  /**
   * Обновление записи дня. При смене даты запись переносится в файл нового дня.
   * Возвращает путь файла, где запись оказалась.
   */
  async updateEntry(oldDate: string, index: number, newDate: string, text: string): Promise<string> {
    const path = this.pathFor(oldDate);
    const file = this.app.vault.getAbstractFileByPath(path) as TFile | null;
    if (file) {
      const content = await this.app.vault.read(file);
      const { header, blocks } = splitDayFile(content);
      if (index >= 0 && index < blocks.length) {
        if (newDate === oldDate) {
          blocks[index] = text.trim();
          await this.app.vault.modify(file, rebuildDay(header, blocks));
          return path;
        }
        const rawText = this.getRawText(blocks, index);
        blocks.splice(index, 1);
        await this.app.vault.modify(file, rebuildDay(header, blocks));
        return await this.addEntry(newDate, text, rawText);
      }
    }
    return await this.addEntry(newDate, text);
  }

  private getRawText(blocks: string[], index: number): string {
    return cleanNoteTextForDisplay(blocks[index]);
  }

  /** Удаление записи дня. Возвращает true, если запись найдена и удалена. */
  async deleteEntry(dateKey: string, index: number): Promise<boolean> {
    const path = this.pathFor(dateKey);
    const file = this.app.vault.getAbstractFileByPath(path) as TFile | null;
    if (!file) return false;
    const content = await this.app.vault.read(file);
    const { header, blocks } = splitDayFile(content);
    if (index < 0 || index >= blocks.length) return false;
    blocks.splice(index, 1);
    const body = blocks.map((b) => b.trim()).filter(Boolean);
    if (!body.length) {
      // Записей не осталось: файл удаляем, только если в шапке нет ручного содержимого
      if (!cleanNoteText(header)) {
        await this.app.fileManager.trashFile(file);
        return true;
      }
    }
    await this.app.vault.modify(file, rebuildDay(header, blocks));
    return true;
  }

  /**
   * Перестановка записи внутри дня: меняет местами блоки index и index+dir
   * (dir = -1 вверх, +1 вниз). Возвращает true, если перестановка выполнена.
   */
  async moveEntry(dateKey: string, index: number, dir: -1 | 1): Promise<boolean> {
    const path = this.pathFor(dateKey);
    const file = this.app.vault.getAbstractFileByPath(path) as TFile | null;
    if (!file) return false;
    const content = await this.app.vault.read(file);
    const { header, blocks } = splitDayFile(content);
    const target = index + dir;
    if (target < 0 || target >= blocks.length) return false;
    const tmp = blocks[index];
    blocks[index] = blocks[target];
    blocks[target] = tmp;
    await this.app.vault.modify(file, rebuildDay(header, blocks));
    return true;
  }

  private weekOf(dateKey: string): string {
    return mondayKeyOf(dateKey);
  }
}

/** Разбиение файла дня на шапку (frontmatter + H1) и блоки записей, разделённые `---`. */
function splitDayFile(content: string): { header: string; blocks: string[] } {
  let text = content.replace(/\r\n/g, "\n");
  const fm = /^---\s*\n[\s\S]*?\n---\s*\n?/.exec(text);
  if (fm) text = text.slice(fm[0].length);
  text = text.replace(/^#\s+[^\n]*\n+/, "");
  const header = content.replace(/\r\n/g, "\n").slice(0, content.replace(/\r\n/g, "\n").length - text.length);
  const blocks = text.split(/\n[ \t]*---[ \t]*\n/).map((b) => b.trim());
  return { header, blocks };
}

/** Сборка файла дня из шапки и блоков записей. */
function rebuildDay(header: string, blocks: string[]): string {
  // Фильтруем пустые блоки, но сохраняем блоки с изображением
  const filteredBlocks = blocks.map((b) => b.trim()).filter((b) => b.length > 0);
  const body = filteredBlocks.join("\n\n---\n\n");
  if (!body) return (header ? header.trimEnd() : "") + "\n";
  return (header ? header.trimEnd() + "\n\n" : "") + body + "\n";
}
