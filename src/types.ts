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
  /** "" — авто (язык Obsidian), "ru" | "en" — явный выбор. */
  language: string;
  /** Периоды жизни, подсвечиваемые пастельным фоном в сетке. */
  zones: LifeZone[];
}

export interface JournalEntry {
  date: string;
  text: string;
  path: string;
  /** Индекс записи внутри файла дня (блоки, разделённые `---`). */
  index: number;
  /** Общее число блоков в файле дня (для кнопок сортировки ▲/▼). */
  blocks: number;
}

export interface LifeEvent {
  date: string;
  color: string;
  title: string;
}

/** Период жизни (зона): подсветка диапазона недель в сетке. */
export interface LifeZone {
  id: string;
  title: string;
  /** ISO YYYY-MM-DD */
  start: string;
  /** ISO YYYY-MM-DD */
  end: string;
  /** #rrggbb (пастельный) */
  color: string;
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

export interface BackupZone {
  title: string;
  start: string;
  end: string;
  color: number;
}

export interface BackupData {
  version: number;
  birthDate: string;
  lifespanYears: number;
  entries: BackupEntry[];
  events: BackupEvent[];
  zones?: BackupZone[];
}

export const DEFAULT_SETTINGS: LifeCalendarSettings = {
  birthDate: "",
  lifespanYears: 100,
  journalFolder: "Life Calendar/Journal",
  weeklyFolder: "Life Calendar/Weekly",
  eventsFile: "Life Calendar/Events.md",
  exportFile: "Life Calendar/backup.json",
  custom: {},
  language: "",
  zones: [],
};

export const HEART_COLORS = ["#d22", "#ff69b4", "#3cb371", "#1e90ff", "#ffa500", "#9370db", "#ffd700", "#323b43"];
export const RING_COLORS = ["#d22", "#ff69b4", "#3cb371", "#1e90ff", "#ffa500", "#9370db", "#00bcd4", "#ffd700"];

/** Пастельные цвета зон (подсветка диапазона недель фоном). */
export const ZONE_COLORS = [
  "#F8C8D4",
  "#FFE0B2",
  "#FFF59D",
  "#C8E6C9",
  "#B3E5FC",
  "#D1C4E9",
  "#F0F4C3",
  "#FFCCBC",
];

export const LIFESPAN_MIN = 50;
export const LIFESPAN_MAX = 120;
