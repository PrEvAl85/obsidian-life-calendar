export interface WeekStyle {
  color?: string;
  ring?: string;
}

export interface LifeCalendarSettings {
  birthDate: string;
  lifespanYears: number;
  journalFolder: string;
  weeklyFolder: string;
  eventsFile: string;
  exportFile: string;
  custom: Record<string, WeekStyle>;
}

export interface JournalEntry {
  date: string;
  text: string;
  path: string;
  /** Индекс записи внутри файла дня (блоки, разделённые `---`). */
  index: number;
}

export interface LifeEvent {
  date: string;
  color: string;
  title: string;
}

export interface BackupEntry {
  date: string;
  text: string;
}

export interface BackupEvent {
  date: string;
  title: string;
  color: number;
}

export interface BackupData {
  version: number;
  birthDate: string;
  lifespanYears: number;
  entries: BackupEntry[];
  events: BackupEvent[];
}

export const DEFAULT_SETTINGS: LifeCalendarSettings = {
  birthDate: "",
  lifespanYears: 100,
  journalFolder: "Life Calendar/Journal",
  weeklyFolder: "Life Calendar/Weekly",
  eventsFile: "Life Calendar/Events.md",
  exportFile: "Life Calendar/backup.json",
  custom: {},
};

export const HEART_COLORS = ["#d22", "#ff69b4", "#3cb371", "#1e90ff", "#ffa500", "#9370db", "#ffd700", "#323b43"];
export const RING_COLORS = ["#d22", "#ff69b4", "#3cb371", "#1e90ff", "#ffa500", "#9370db", "#00bcd4", "#ffd700"];

export const LIFESPAN_MIN = 50;
export const LIFESPAN_MAX = 120;
