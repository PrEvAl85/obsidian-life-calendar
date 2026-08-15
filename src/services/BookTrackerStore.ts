import { App, TFile } from "obsidian";
import {
  BookDefinition,
  BookEntry,
  BookStats,
  BookType,
  MonthlyBookStats,
  WeeklyBookStats,
  BookTrackerSettings,
  HEATMAP_COLORS,
} from "../types";

const BOOK_LINE_REGEX = /^(.*?):\s+([\d.,]+)\s*(\S+)?\s*(тр\.?\s*рейтинг[:\s]*(\d+)|rating[:\s]*(\d+))?\s*(\S+)?$/gim;

export class BookTrackerStore {
  private app: App;
  private settings: BookTrackerSettings;
  private booksMap: Map<string, BookDefinition> = new Map();
  private entriesCache: Map<string, BookEntry[]> = new Map();
  private statsCache: BookStats | null = null;
  private cacheValid = false;

  constructor(app: App, getSettings: () => BookTrackerSettings) {
    this.app = app;
    this.settings = getSettings();
    this.rebuildBooksMap();
  }

  private rebuildBooksMap(): void {
    this.booksMap.clear();
    for (const book of this.settings.books) {
      this.booksMap.set(book.id, book);
    }
  }

  getBooks(): BookDefinition[] {
    return [...this.settings.books].sort((a, b) => a.order - b.order);
  }

  /** Returns unique books that appear in journal entries (including typed-in ones). */
  async getJournalBooks(): Promise<{ bookId: string; name: string; author?: string; bookType?: BookType; dateStarted?: string }[]> {
    const allEntries = await this.loadAllEntries();
    const map = new Map<string, { bookId: string; name: string; author?: string; bookType?: BookType; dateStarted?: string }>();
    for (const [date, entries] of allEntries) {
      for (const e of entries) {
        const existing = map.get(e.bookId);
        if (!existing) {
          map.set(e.bookId, {
            bookId: e.bookId,
            name: e.name,
            author: e.author,
            bookType: e.bookType,
            dateStarted: date,
          });
        } else {
          // Keep earliest start date
          if (!existing.dateStarted || date < existing.dateStarted) {
            existing.dateStarted = date;
          }
          if (!existing.bookType && e.bookType) existing.bookType = e.bookType;
          if (!existing.author && e.author) existing.author = e.author;
        }
      }
    }
    return [...map.values()];
  }

  getBookById(id: string): BookDefinition | undefined {
    return this.booksMap.get(id);
  }

  getBookByName(name: string): BookDefinition | undefined {
    for (const book of this.settings.books) {
      if (book.name.toLowerCase() === name.toLowerCase()) return book;
    }
    return undefined;
  }

  hasBooks(): boolean {
    return this.settings.books.length > 0;
  }

  async addBook(definition: BookDefinition): Promise<void> {
    this.settings.books.push(definition);
    this.rebuildBooksMap();
    this.invalidateCache();
  }

  async updateBook(id: string, updates: Partial<BookDefinition>): Promise<void> {
    const idx = this.settings.books.findIndex((b) => b.id === id);
    if (idx === -1) return;
    this.settings.books[idx] = { ...this.settings.books[idx], ...updates };
    this.rebuildBooksMap();
    this.invalidateCache();
  }

  async removeBook(id: string): Promise<void> {
    this.settings.books = this.settings.books.filter((b) => b.id !== id);
    this.rebuildBooksMap();
    this.invalidateCache();
  }

  async reorderBooks(ids: string[]): Promise<void> {
    const newOrder: BookDefinition[] = [];
    for (const id of ids) {
      const book = this.settings.books.find((b) => b.id === id);
      if (book) newOrder.push(book);
    }
    for (const book of this.settings.books) {
      if (!ids.includes(book.id)) newOrder.push(book);
    }
    this.settings.books = newOrder;
    for (let i = 0; i < newOrder.length; i++) {
      newOrder[i].order = i;
    }
    this.rebuildBooksMap();
    this.invalidateCache();
  }

  setDailyNotesFolder(folder: string): void {
    this.settings.dailyNotesFolder = folder;
  }

  private invalidateCache(): void {
    this.entriesCache.clear();
    this.statsCache = null;
    this.cacheValid = false;
  }

  async onSettingsChange(newSettings: BookTrackerSettings): Promise<void> {
    this.settings = newSettings;
    this.rebuildBooksMap();
    this.invalidateCache();
  }

  private findDailyNotesFiles(): TFile[] {
    const folder = this.settings.dailyNotesFolder || "Life Calendar/Journal";
    return this.app.vault.getFiles().filter((f) => {
      if (!f.path.startsWith(folder + "/")) return false;
      if (!f.path.endsWith(".md")) return false;
      const name = f.name.replace(".md", "");
      return /^\d{2}\.\d{2}\.\d{4}$/.test(name);
    });
  }

  private parseDateFromFilename(filename: string): string | null {
    const name = filename.replace(".md", "");
    const match = name.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (!match) return null;
    return `${match[3]}-${match[2]}-${match[1]}`;
  }

  private parseBookLines(content: string, date: string): BookEntry[] {
    const entries: BookEntry[] = [];
    const lines = content.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Only recognize lines with the book prefix (📖), except legacy "Name: value" format
      const hasPrefix = trimmed.startsWith("📖");
      const text = hasPrefix ? trimmed.replace(/^📖\s*/, "").trim() : trimmed;
      if (!text) continue;
      
      // Check if this is a "read" marker line (e.g., "Book Name (прочитано)")
      const readMatch = text.match(/^(.+?)\s*\(прочитано\)$/i);
      // Remove the "(прочитано)" suffix before parsing name/value
      const body = readMatch ? readMatch[1].trim() : text;
      
      const ratingMatch = body.match(/тр\.\s*рейтинг:\s*(\d+)/i) || 
                          body.match(/rating:\s*(\d+)/i);
      
      if (!hasPrefix && !readMatch && !body.match(/:/)) continue;

      // Try to match "Name: value unit" or "Name: value"
      const bookMatch = body.match(/^(.+?):\s+([\d.,]+)\s*(стр|глав|ч)\.?\s*(?:\(тр\.?\s*рейтинг:\s*[\d.,]+\s*\))?$/i) ||
                        body.match(/^(.+?):\s+([\d.,]+)\s*(?:\(тр\.?\s*рейтинг:\s*[\d.,]+\s*\))?$/i);
      
      if (!bookMatch) {
        // Only create a value-less entry for explicitly prefixed book lines
        if (!hasPrefix) continue;
        const { name, author, bookType } = this.splitNameAuthor(body);
        if (!name) continue;
        
        const bookDef = this.getBookByName(name);
        
        entries.push({
          id: `entry_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
          bookId: bookDef?.id || `temp_${name.toLowerCase().replace(/\s+/g, '_')}`,
          name,
          author: author || bookDef?.author,
          bookType: bookType || bookDef?.bookType,
          date,
          createdAt: new Date().toISOString(),
          read: readMatch ? true : undefined,
        });
        continue;
      }
      
      const { name, author, bookType } = this.splitNameAuthor(bookMatch[1]);
      const value = parseFloat(bookMatch[2].replace(',', '.'));
      const unit = (bookMatch[3]?.toLowerCase() || 'pages') as 'pages' | 'chapters' | 'hours';
      const rating = ratingMatch ? parseInt(ratingMatch[1], 10) : undefined;
      
      if (isNaN(value) || value <= 0 || !name) continue;

      const bookDef = this.getBookByName(name);
      
      entries.push({
        id: `entry_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        bookId: bookDef?.id || `temp_${name.toLowerCase().replace(/\s+/g, '_')}`,
        name,
        author: author || bookDef?.author,
        bookType: bookType || bookDef?.bookType,
        value,
        unit,
        date,
        createdAt: new Date().toISOString(),
        rating,
        read: readMatch ? true : undefined,
      });
    }
    
    return entries;
  }

  async loadAllEntries(): Promise<Map<string, BookEntry[]>> {
    if (this.cacheValid && this.entriesCache.size > 0) {
      return this.entriesCache;
    }

    const files = this.findDailyNotesFiles();
    const result = new Map<string, BookEntry[]>();

    for (const file of files) {
      const date = this.parseDateFromFilename(file.name);
      if (!date) continue;

      try {
        const content = await this.app.vault.read(file);
        const entries = this.parseBookLines(content, date);
        if (entries.length > 0) {
          result.set(date, entries);
        }
      } catch (e) {
        console.error(`BookTracker: error reading ${file.path}`, e);
      }
    }

    this.entriesCache = result;
    this.cacheValid = true;
    return result;
  }

  async getStats(): Promise<BookStats> {
    if (this.statsCache && this.cacheValid) {
      return this.statsCache;
    }

    const allEntries = await this.loadAllEntries();
    const stats = this.computeStats(allEntries);
    this.statsCache = stats;
    this.cacheValid = true;
    return stats;
  }

  private computeStats(entriesByDate: Map<string, BookEntry[]>): BookStats {
    const totals: Record<string, number> = {};
    let activeDays = 0;
    const dailyTotals: Record<string, number> = {};
    const monthly: Record<string, MonthlyBookStats> = {};
    const weekly: Record<string, WeeklyBookStats> = {};

    for (const [date, entries] of entriesByDate) {
      let dayTotal = 0;
      for (const entry of entries) {
        const key = entry.bookId;
        const val = entry.value || 0;
        totals[key] = (totals[key] || 0) + val;
        dayTotal += val;
      }

      if (dayTotal > 0) {
        activeDays++;
        dailyTotals[date] = dayTotal;
      }

      const yearMonth = date.slice(0, 7);
      if (!monthly[yearMonth]) {
        monthly[yearMonth] = {
          yearMonth,
          days: 0,
          totals: {},
          entries: [],
        };
      }
      monthly[yearMonth].days++;
      for (const entry of entries) {
        const val = entry.value || 0;
        monthly[yearMonth].totals[entry.bookId] =
          (monthly[yearMonth].totals[entry.bookId] || 0) + val;
        monthly[yearMonth].entries.push(entry);
      }

      const weekKey = this.getWeekKey(date);
      if (!weekly[weekKey]) {
        const start = this.getWeekStart(weekKey);
        const end = this.addDays(start, 6);
        weekly[weekKey] = {
          weekKey,
          startDate: start,
          endDate: end,
          days: 0,
          totals: {},
          entries: [],
        };
      }
      weekly[weekKey].days++;
      for (const entry of entries) {
        const val = entry.value || 0;
        weekly[weekKey].totals[entry.bookId] =
          (weekly[weekKey].totals[entry.bookId] || 0) + val;
        weekly[weekKey].entries.push(entry);
      }
    }

    const bestStreak = this.computeBestStreak(dailyTotals);
    
    let bestDay: { date: string; value: number } | null = null;
    for (const [date, total] of Object.entries(dailyTotals)) {
      if (!bestDay || total > bestDay.value) {
        bestDay = { date, value: total };
      }
    }

    return {
      totals,
      activeDays,
      bestStreak,
      bestDay,
      monthly,
      weekly,
    };
  }

  private computeBestStreak(dailyTotals: Record<string, number>): number {
    const activeDates = Object.keys(dailyTotals)
      .filter((d) => dailyTotals[d] > 0)
      .sort();
    
    if (activeDates.length === 0) return 0;

    let best = 1;
    let current = 1;

    for (let i = 1; i < activeDates.length; i++) {
      const diff = this.diffDays(activeDates[i - 1], activeDates[i]);
      if (diff === 1) {
        current++;
        if (current > best) best = current;
      } else {
        current = 1;
      }
    }
    return best;
  }

  async getHeatmapData(year: number): Promise<Map<string, number>> {
    const allEntries = await this.loadAllEntries();
    const dailyTotals = new Map<string, number>();

    for (const [date, dayEntries] of allEntries) {
      if (!date.startsWith(year.toString())) continue;
      let total = 0;
      for (const entry of dayEntries) {
        total += entry.value || 0;
      }
      dailyTotals.set(date, total);
    }

    return dailyTotals;
  }

  getHeatmapColor(value: number, maxValue: number): string {
    if (value <= 0) return HEATMAP_COLORS[0];
    if (maxValue <= 0) return HEATMAP_COLORS[1];
    const ratio = value / maxValue;
    const index = Math.min(4, Math.ceil(ratio * 4));
    return HEATMAP_COLORS[index];
  }

  private getWeekKey(date: string): string {
    const [y, m, d] = date.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    const day = dt.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    dt.setDate(dt.getDate() + diff);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  }

  private getWeekStart(weekKey: string): string {
    return weekKey;
  }

  private addDays(dateStr: string, days: number): string {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + days);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  }

  private diffDays(a: string, b: string): number {
    const [y1, m1, d1] = a.split('-').map(Number);
    const [y2, m2, d2] = b.split('-').map(Number);
    const dt1 = new Date(y1, m1 - 1, d1);
    const dt2 = new Date(y2, m2 - 1, d2);
    return Math.round((dt2.getTime() - dt1.getTime()) / 86400000);
  }

  formatBookLine(entry: BookEntry): string {
    let unitStr: string = 'стр.';
    switch (entry.unit) {
      case 'pages': unitStr = 'стр.'; break;
      case 'chapters': unitStr = 'глав.'; break;
      case 'hours': unitStr = 'ч.'; break;
      default: unitStr = 'стр.';
    }
    
    let line = "📖 " + entry.name;
    if (entry.bookType && entry.bookType !== "electronic") {
      const typeLabel = this.bookTypeLabel(entry.bookType);
      if (typeLabel) line += ` (${typeLabel})`;
    }
    if (entry.author) {
      line += " — " + entry.author;
    }
    if (entry.value !== undefined && entry.value > 0) {
      line += `: ${entry.value} ${unitStr}`;
      if (entry.rating) {
        line += ` (тр. рейтинг: ${entry.rating})`;
      }
    }
    return line;
  }

  private bookTypeLabel(type: BookType): string | null {
    switch (type) {
      case "electronic": return null;
      case "paper": return "бумажная";
      case "audiobook": return "аудио";
      default: return null;
    }
  }

  private bookTypeFromLabel(label: string): BookType | undefined {
    switch (label.trim().toLowerCase()) {
      case "бумажная":
      case "бумажная книга":
      case "paper":
        return "paper";
      case "аудио":
      case "аудиокнига":
      case "audiobook":
        return "audiobook";
      case "электронная":
      case "электронная книга":
      case "electronic":
        return "electronic";
      default:
        return undefined;
    }
  }

  private splitNameAuthor(full: string): { name: string; author?: string; bookType?: BookType } {
    // Strip rating and value/unit suffixes so they never leak into name/author
    let t = full.trim();
    t = t.replace(/\s*\(тр\.?\s*рейтинг:\s*[\d.,]+\s*\)\s*$/i, "").trim();
    t = t.replace(/:?\s*[\d.,]+\s*(стр|глав|ч)\.?\s*$/i, "").trim();
    t = t.replace(/:\s*[\d.,]+\s*$/i, "").trim();
    // Extract type suffix from name part: "Name (бумажная)" or "Name (аудио)"
    const typeMatch = t.match(/^(.+?)\s*\((.+?)\)(?:\s+—\s+(.+))?$/);
    if (typeMatch) {
      const bookType = this.bookTypeFromLabel(typeMatch[2]);
      if (bookType) {
        return {
          name: typeMatch[1].trim(),
          author: typeMatch[3]?.trim() || undefined,
          bookType,
        };
      }
    }
    const idx = t.indexOf(" — ");
    if (idx > 0) {
      return {
        name: t.slice(0, idx).trim(),
        author: t.slice(idx + 3).trim() || undefined,
        bookType: undefined,
      };
    }
    return { name: t.trim(), author: undefined, bookType: undefined };
  }

  async saveEntryToDailyNote(entry: BookEntry): Promise<void> {
    const folder = this.settings.dailyNotesFolder || "Life Calendar/Journal";
    
    // Save entry on start date
    const [y, m, d] = entry.date.split('-').map(Number);
    const filename = `${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}.${y}.md`;
    const path = `${folder}/${filename}`;

    let line = this.formatBookLine(entry);

    let file = this.app.vault.getAbstractFileByPath(path) as TFile | null;
    
    // If finished date equals start date, only write the finished line (avoid duplicate)
    const sameDate = entry.dateFinished === entry.date;

    if (file && !sameDate) {
      const content = await this.app.vault.read(file);
      const newContent = this.upsertBookLine(content, entry.name, line);
      if (newContent !== content) {
        await this.app.vault.modify(file, newContent);
      }
    } else if (!file && !sameDate) {
      await this.ensureFolder(folder);
      await this.app.vault.create(path, line + "\n");
    }

    // If finished date exists, create entry on that date for "read" tracking
    if (entry.dateFinished) {
      const [fy, fm, fd] = entry.dateFinished.split('-').map(Number);
      const finishedFilename = `${String(fd).padStart(2, '0')}.${String(fm).padStart(2, '0')}.${fy}.md`;
      const finishedPath = `${folder}/${finishedFilename}`;

      const finishedLine = this.formatBookLine(entry) + " (прочитано)";

      let finishedFile = this.app.vault.getAbstractFileByPath(finishedPath) as TFile | null;
      
      if (finishedFile) {
        const content = await this.app.vault.read(finishedFile);
        const newContent = this.upsertBookLine(content, entry.name, finishedLine);
        if (newContent !== content) {
          await this.app.vault.modify(finishedFile, newContent);
        }
      } else {
        await this.ensureFolder(folder);
        await this.app.vault.create(finishedPath, finishedLine + "\n");
      }
    }

    this.invalidateCache();
  }

  async updateEntryInDailyNote(entry: BookEntry, oldName: string): Promise<void> {
    const folder = this.settings.dailyNotesFolder || "Life Calendar/Journal";
    
    // Remove old entry first
    const [y, m, d] = entry.date.split('-').map(Number);
    const filename = `${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}.${y}.md`;
    const path = `${folder}/${filename}`;

    let file = this.app.vault.getAbstractFileByPath(path) as TFile | null;
    
    if (file) {
      const content = await this.app.vault.read(file);
      let newContent = this.removeBookLine(content, oldName);
      // Add updated line
      const line = this.formatBookLine(entry);
      if (line.trim()) {
        newContent = newContent ? newContent + '\n' + line : line;
      }
      if (newContent !== content && newContent.trim()) {
        await this.app.vault.modify(file, newContent);
      } else if (newContent.trim() === '') {
        await this.app.vault.delete(file);
      }
    }

    this.invalidateCache();
  }

  async removeEntryFromDailyNote(entry: BookEntry): Promise<void> {
    const folder = this.settings.dailyNotesFolder || "Life Calendar/Journal";
    const [y, m, d] = entry.date.split('-').map(Number);
    const filename = `${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}.${y}.md`;
    const path = `${folder}/${filename}`;

    const file = this.app.vault.getAbstractFileByPath(path) as TFile | null;
    
    if (file) {
      const content = await this.app.vault.read(file);
      const newContent = this.removeBookLine(content, entry.name);
      if (newContent !== content) {
        if (newContent.trim() === '') {
          await this.app.vault.delete(file);
        } else {
          await this.app.vault.modify(file, newContent);
        }
      }
    }

    // Remove entry from finished date if exists
    if (entry.dateFinished) {
      const [fy, fm, fd] = entry.dateFinished.split('-').map(Number);
      const finishedFilename = `${String(fd).padStart(2, '0')}.${String(fm).padStart(2, '0')}.${fy}.md`;
      const finishedPath = `${folder}/${finishedFilename}`;

      const finishedFile = this.app.vault.getAbstractFileByPath(finishedPath) as TFile | null;
      if (finishedFile) {
        const content = await this.app.vault.read(finishedFile);
        const newContent = this.removeBookLine(content, entry.name);
        if (newContent !== content) {
          if (newContent.trim() === '') {
            await this.app.vault.delete(finishedFile);
          } else {
            await this.app.vault.modify(finishedFile, newContent);
          }
        }
      }
    }

    this.invalidateCache();
  }

  /**
   * Updates the book's metadata (name/author/type) across ALL journal records,
   * preserving each record's value/unit/read/rating. Also updates the settings
   * definition if the book exists there. Used when editing a book's start record.
   */
  async updateBookAcrossJournal(oldName: string, updated: BookEntry): Promise<void> {
    const folder = this.settings.dailyNotesFolder || "Life Calendar/Journal";
    const files = this.findDailyNotesFiles();

    for (const file of files) {
      const date = this.parseDateFromFilename(file.name);
      if (!date) continue;
      const content = await this.app.vault.read(file);
      const newContent = this.rewriteBookLines(content, date, oldName, updated);
      if (newContent !== content) {
        if (newContent.trim() === '') {
          await this.app.vault.delete(file);
        } else {
          await this.app.vault.modify(file, newContent);
        }
      }
    }

    // Update settings definition if the book was a known book
    const def = this.getBookByName(oldName);
    if (def) {
      await this.updateBook(def.id, { name: updated.name, author: updated.author, bookType: updated.bookType });
    }

    this.invalidateCache();
  }

  private rewriteBookLines(content: string, date: string, oldName: string, updated: BookEntry): string {
    const nameLower = oldName.toLowerCase();
    const lines = content.split('\n');
    const result: string[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) { result.push(line); continue; }
      const hasPrefix = trimmed.startsWith("📖");
      const text = hasPrefix ? trimmed.replace(/^📖\s*/, "").trim() : trimmed;
      const extracted = this.extractBookName(text);
      if (!extracted || extracted.toLowerCase() !== nameLower) {
        result.push(line);
        continue;
      }
      // Rebuild this line with the new metadata, preserving value/unit/read/rating
      const parsed = this.parseBookLines(line, date);
      const e = parsed[0];
      if (!e) { result.push(line); continue; }
      const rebuilt: BookEntry = {
        ...updated,
        value: e.value,
        unit: e.unit,
        read: e.read,
        rating: e.rating,
        date,
      };
      let newLine = this.formatBookLine(rebuilt);
      if (e.read) newLine += " (прочитано)";
      result.push(newLine);
    }
    return result.join('\n');
  }

  /**
   * Removes ALL records of a book across the whole journal and removes the book
   * definition from settings if it exists.
   */
  async deleteBookCompletely(bookName: string): Promise<void> {
    const folder = this.settings.dailyNotesFolder || "Life Calendar/Journal";
    const files = this.findDailyNotesFiles();

    for (const file of files) {
      const content = await this.app.vault.read(file);
      const newContent = this.removeBookLine(content, bookName);
      if (newContent !== content) {
        if (newContent.trim() === '') {
          await this.app.vault.delete(file);
        } else {
          await this.app.vault.modify(file, newContent);
        }
      }
    }

    const def = this.getBookByName(bookName);
    if (def) {
      await this.removeBook(def.id);
    }

    this.invalidateCache();
  }

  private extractBookName(text: string): string | null {
    // Strip " (прочитано)" marker
    let t = text.replace(/\s*\(прочитано\)\s*$/i, "").trim();
    // Strip rating suffix
    t = t.replace(/\s*\(тр\.?\s*рейтинг:\s*[\d.,]+\s*\)\s*$/i, "").trim();
    // Strip ": value unit" part
    const colonIdx = t.indexOf(':');
    if (colonIdx > 0) t = t.slice(0, colonIdx).trim();
    // Strip " — Author" suffix
    const authorIdx = t.indexOf(" — ");
    if (authorIdx > 0) t = t.slice(0, authorIdx).trim();
    // Strip book type suffix " (бумажная)" / " (аудио)"
    t = t.replace(/\s*\(([^)]*)\)\s*$/i, "").trim();
    return t || null;
  }

  private removeBookLine(content: string, bookName: string): string {
    const lines = content.split('\n');
    const nameLower = bookName.toLowerCase();
    const result = lines.filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return false;
      
      // Strip the book prefix before matching
      const text = trimmed.startsWith("📖") ? trimmed.replace(/^📖\s*/, "").trim() : trimmed;
      
      const extracted = this.extractBookName(text);
      if (!extracted) return true;
      if (extracted.toLowerCase() === nameLower) return false;
      
      return true;
    });
    return result.join('\n');
  }

  private upsertBookLine(content: string, bookName: string, newLine: string): string {
    const lines = content.split('\n');
    const nameLower = bookName.toLowerCase();
    let found = false;

    const result: string[] = [];
    for (const line of lines) {
      const text = line.trim().startsWith("📖") ? line.trim().replace(/^📖\s*/, "").trim() : line.trim();
      const extracted = this.extractBookName(text);
      if (extracted && extracted.toLowerCase() === nameLower) {
        found = true;
        continue;
      }
      result.push(line);
    }

    if (found) {
      result.push(newLine);
      return result.join('\n');
    }

    lines.push(newLine);
    return lines.join('\n');
  }

  private async ensureFolder(folder: string): Promise<void> {
    const parts = folder.split('/');
    let currentPath = '';
    for (const part of parts) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const exists = this.app.vault.getAbstractFileByPath(currentPath);
      if (!exists) {
        try {
          await this.app.vault.createFolder(currentPath);
        } catch {
          // ignore
        }
      }
    }
  }
}