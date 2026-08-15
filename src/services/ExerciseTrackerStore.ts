import { App, TFile } from "obsidian";
import {
  ExerciseDefinition,
  ExerciseEntry,
  ExerciseStats,
  MonthlyExerciseStats,
  WeeklyExerciseStats,
  DEFAULT_EXERCISE_DEFINITIONS,
  HEATMAP_COLORS,
  ExerciseTrackerSettings,
} from "../types";

const EXERCISE_LINE_REGEX = /^([^:]+):\s*([\d.,]+)\s*(\S.*)?$/gm;

export class ExerciseTrackerStore {
  private app: App;
  private settings: ExerciseTrackerSettings;
  private exercisesMap: Map<string, ExerciseDefinition> = new Map();
  private entriesCache: Map<string, ExerciseEntry[]> = new Map();
  private statsCache: ExerciseStats | null = null;
  private cacheValid = false;

  constructor(app: App, getSettings: () => ExerciseTrackerSettings) {
    this.app = app;
    this.settings = getSettings();
    this.rebuildExercisesMap();
  }

  private rebuildExercisesMap(): void {
    this.exercisesMap.clear();
    for (const ex of this.settings.exercises) {
      this.exercisesMap.set(ex.id, ex);
    }
  }

  getExercises(): ExerciseDefinition[] {
    return [...this.settings.exercises].sort((a, b) => a.order - b.order);
  }

  getExerciseById(id: string): ExerciseDefinition | undefined {
    return this.exercisesMap.get(id);
  }

  getExerciseByName(name: string): ExerciseDefinition | undefined {
    for (const ex of this.settings.exercises) {
      if (ex.name.toLowerCase() === name.toLowerCase()) return ex;
    }
    return undefined;
  }

  async addExercise(definition: ExerciseDefinition): Promise<void> {
    this.settings.exercises.push(definition);
    this.rebuildExercisesMap();
    this.invalidateCache();
  }

  async updateExercise(id: string, updates: Partial<ExerciseDefinition>): Promise<void> {
    const idx = this.settings.exercises.findIndex((e) => e.id === id);
    if (idx === -1) return;
    this.settings.exercises[idx] = { ...this.settings.exercises[idx], ...updates };
    this.rebuildExercisesMap();
    this.invalidateCache();
  }

  async removeExercise(id: string): Promise<void> {
    this.settings.exercises = this.settings.exercises.filter((e) => e.id !== id);
    this.rebuildExercisesMap();
    this.invalidateCache();
  }

  async reorderExercises(ids: string[]): Promise<void> {
    const newOrder: ExerciseDefinition[] = [];
    for (const id of ids) {
      const ex = this.settings.exercises.find((e) => e.id === id);
      if (ex) newOrder.push(ex);
    }
    // Add any missing exercises at the end
    for (const ex of this.settings.exercises) {
      if (!ids.includes(ex.id)) newOrder.push(ex);
    }
    this.settings.exercises = newOrder;
    for (let i = 0; i < newOrder.length; i++) {
      newOrder[i].order = i;
    }
    this.rebuildExercisesMap();
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

  // ===== Parsing Daily Notes =====

  private findDailyNotesFiles(): TFile[] {
    const folder = this.settings.dailyNotesFolder || "daily";
    return this.app.vault.getFiles().filter((f) => {
      if (!f.path.startsWith(folder + "/")) return false;
      if (!f.path.endsWith(".md")) return false;
      // Check filename format DD.MM.YYYY.md
      const name = f.name.replace(".md", "");
      return /^\d{2}\.\d{2}\.\d{4}$/.test(name);
    });
  }

  private parseDateFromFilename(filename: string): string | null {
    const name = filename.replace(".md", "");
    const match = name.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (!match) return null;
    return `${match[3]}-${match[2]}-${match[1]}`; // YYYY-MM-DD
  }

  private parseExerciseLines(content: string, date: string): ExerciseEntry[] {
    const entries: ExerciseEntry[] = [];
    let match: RegExpExecArray | null;
    
    // Reset regex lastIndex
    EXERCISE_LINE_REGEX.lastIndex = 0;
    
    while ((match = EXERCISE_LINE_REGEX.exec(content)) !== null) {
      const name = match[1].trim();
      const valueStr = match[2].replace(',', '.');
      const value = parseFloat(valueStr);
      const unitPart = match[3] ? match[3].trim() : "";
      
      if (isNaN(value) || !name) continue;

      // Determine exercise definition
      let exDef = this.getExerciseByName(name);
      if (!exDef) {
        // Create temporary definition for unknown exercises
        exDef = {
          id: `temp_${name.toLowerCase().replace(/\s+/g, '_')}`,
          name,
          defaultUnit: 'reps',
          order: 999,
        };
      }

      // Parse unit from the line
      let unit = exDef.defaultUnit;
      let customUnit: string | undefined;
      
      if (unitPart) {
        const unitLower = unitPart.toLowerCase();
        if (unitLower.includes('повтор') || unitLower === 'reps' || unitLower === 'раз') {
          unit = 'reps';
        } else if (unitLower.includes('мин') || unitLower === 'min') {
          unit = 'min';
        } else if (unitLower.includes('кг') || unitLower === 'kg') {
          unit = 'kg';
        } else if (unitLower.includes('км') || unitLower === 'km') {
          unit = 'km';
        } else {
          unit = 'custom';
          customUnit = unitPart;
        }
      }

      entries.push({
        id: `entry_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        exerciseId: exDef.id,
        name: exDef.name,
        value,
        unit,
        customUnit,
        date,
        createdAt: new Date().toISOString(),
      });
    }
    
    return entries;
  }

  async loadAllEntries(): Promise<Map<string, ExerciseEntry[]>> {
    if (this.cacheValid && this.entriesCache.size > 0) {
      return this.entriesCache;
    }

    const files = this.findDailyNotesFiles();
    const result = new Map<string, ExerciseEntry[]>();

    for (const file of files) {
      const date = this.parseDateFromFilename(file.name);
      if (!date) continue;

      try {
        const content = await this.app.vault.read(file);
        const entries = this.parseExerciseLines(content, date);
        if (entries.length > 0) {
          result.set(date, entries);
        }
      } catch (e) {
        console.error(`ExerciseTracker: error reading ${file.path}`, e);
      }
    }

    this.entriesCache = result;
    this.cacheValid = true;
    return result;
  }

  // ===== Statistics =====

  async getStats(): Promise<ExerciseStats> {
    if (this.statsCache && this.cacheValid) {
      return this.statsCache;
    }

    const allEntries = await this.loadAllEntries();
    const stats = this.computeStats(allEntries);
    this.statsCache = stats;
    this.cacheValid = true;
    return stats;
  }

  private computeStats(entriesByDate: Map<string, ExerciseEntry[]>): ExerciseStats {
    const totals: Record<string, number> = {};
    let activeDays = 0;
    const dailyTotals: Record<string, number> = {};
    const monthly: Record<string, MonthlyExerciseStats> = {};
    const weekly: Record<string, WeeklyExerciseStats> = {};

    // Process each day
    for (const [date, entries] of entriesByDate) {
      let dayTotal = 0;
      for (const entry of entries) {
        const key = entry.exerciseId;
        totals[key] = (totals[key] || 0) + entry.value;
        dayTotal += entry.value;
      }

      if (dayTotal > 0) {
        activeDays++;
        dailyTotals[date] = dayTotal;
      }

      // Monthly aggregation
      const yearMonth = date.slice(0, 7); // YYYY-MM
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
        monthly[yearMonth].totals[entry.exerciseId] = 
          (monthly[yearMonth].totals[entry.exerciseId] || 0) + entry.value;
        monthly[yearMonth].entries.push(entry);
      }

      // Weekly aggregation (Monday-based)
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
        weekly[weekKey].totals[entry.exerciseId] = 
          (weekly[weekKey].totals[entry.exerciseId] || 0) + entry.value;
        weekly[weekKey].entries.push(entry);
      }
    }

    // Best streak
    const bestStreak = this.computeBestStreak(dailyTotals);
    
    // Best day
    let bestDay: { date: string; total: number } | null = null;
    for (const [date, total] of Object.entries(dailyTotals)) {
      if (!bestDay || total > bestDay.total) {
        bestDay = { date, total };
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

  // ===== Heatmap =====

  async getHeatmapData(year: number): Promise<Map<string, number>> {
    const allEntries = await this.loadAllEntries();
    const dailyTotals = new Map<string, number>();

    for (const [date, dayEntries] of allEntries) {
      if (!date.startsWith(year.toString())) continue;
      let total = 0;
      for (const entry of dayEntries) {
        total += entry.value;
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

  // ===== Utility =====

  private getWeekKey(date: string): string {
    // Returns Monday of the week as YYYY-MM-DD
    const [y, m, d] = date.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    const day = dt.getDay(); // 0 = Sunday
    const diff = day === 0 ? -6 : 1 - day; // Monday = 1
    dt.setDate(dt.getDate() + diff);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  }

  private getWeekStart(weekKey: string): string {
    return weekKey; // weekKey is already Monday
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

  // ===== Save to Daily Note =====

  async saveEntryToDailyNote(entry: ExerciseEntry): Promise<void> {
    const folder = this.settings.dailyNotesFolder || "daily";
    const [y, m, d] = entry.date.split('-').map(Number);
    const filename = `${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}.${y}.md`;
    const path = `${folder}/${filename}`;

    const line = this.formatExerciseLine(entry);

    let file = this.app.vault.getAbstractFileByPath(path) as TFile | null;
    
    if (file) {
      const content = await this.app.vault.read(file);
      const newContent = this.upsertExerciseLine(content, entry.name, line);
      if (newContent !== content) {
        await this.app.vault.modify(file, newContent);
      }
    } else {
      // Create new file with the exercise line
      await this.ensureFolder(folder);
      await this.app.vault.create(path, line + "\n");
    }

    this.invalidateCache();
  }

  async removeEntryFromDailyNote(entry: ExerciseEntry): Promise<void> {
    const folder = this.settings.dailyNotesFolder || "daily";
    const [y, m, d] = entry.date.split('-').map(Number);
    const filename = `${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}.${y}.md`;
    const path = `${folder}/${filename}`;

    const file = this.app.vault.getAbstractFileByPath(path) as TFile | null;
    
    if (file) {
      const content = await this.app.vault.read(file);
      const newContent = this.removeExerciseLine(content, entry.name);
      if (newContent !== content) {
        if (newContent.trim() === '') {
          await this.app.vault.delete(file);
        } else {
          await this.app.vault.modify(file, newContent);
        }
      }
    }

    this.invalidateCache();
  }

  private removeExerciseLine(content: string, exerciseName: string): string {
    const lines = content.split('\n');
    const nameLower = exerciseName.toLowerCase();
    const result = lines.filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return false;
      const colonIdx = trimmed.indexOf(':');
      if (colonIdx > 0) {
        const name = trimmed.slice(0, colonIdx).trim().toLowerCase();
        if (name === nameLower) return false;
      }
      return true;
    });
    return result.join('\n');
  }

  private formatExerciseLine(entry: ExerciseEntry): string {
    let unitStr: string = entry.unit;
    if (entry.unit === 'custom' && entry.customUnit) {
      unitStr = entry.customUnit;
    } else {
      // Use localized unit labels
      const labels: Record<string, string> = {
        reps: 'повт',
        min: 'мин',
        kg: 'кг',
        km: 'км',
      };
      unitStr = unitStr in labels ? labels[unitStr] : unitStr;
    }
    return `${entry.name}: ${entry.value} ${unitStr}`;
  }

  private upsertExerciseLine(content: string, exerciseName: string, newLine: string): string {
    const lines = content.split('\n');
    const nameLower = exerciseName.toLowerCase();
    let found = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const colonIdx = line.indexOf(':');
      if (colonIdx > 0) {
        const name = line.slice(0, colonIdx).trim().toLowerCase();
        if (name === nameLower) {
          lines[i] = newLine;
          found = true;
          break;
        }
      }
    }

    if (!found) {
      lines.push(newLine);
    }

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

  // ===== Reset Cache =====
  
  onSettingsChange(newSettings: ExerciseTrackerSettings): void {
    this.settings = newSettings;
    this.rebuildExercisesMap();
    this.invalidateCache();
  }
}