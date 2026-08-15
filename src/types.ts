export interface WeekStyle {
  color?: string;
  ring?: string;
}

// ===== Exercise Tracker Types =====

export type ExerciseUnit = 'reps' | 'min' | 'kg' | 'km' | 'custom';

export interface ExerciseDefinition {
  id: string;
  name: string;
  defaultUnit: ExerciseUnit;
  customUnit?: string;
  color?: string;
  order: number;
}

export interface ExerciseEntry {
  id: string;
  exerciseId: string;
  name: string;
  value: number;
  unit: ExerciseUnit;
  customUnit?: string;
  date: string; // YYYY-MM-DD
  createdAt: string;
}

export interface ExerciseStats {
  totals: Record<string, number>;
  activeDays: number;
  bestStreak: number;
  bestDay: { date: string; total: number } | null;
  monthly: Record<string, MonthlyExerciseStats>;
  weekly: Record<string, WeeklyExerciseStats>;
}

export interface MonthlyExerciseStats {
  yearMonth: string; // YYYY-MM
  days: number;
  totals: Record<string, number>;
  entries: ExerciseEntry[];
}

export interface WeeklyExerciseStats {
  weekKey: string; // Monday YYYY-MM-DD
  startDate: string;
  endDate: string;
  days: number;
  totals: Record<string, number>;
  entries: ExerciseEntry[];
}

export interface ExerciseTrackerSettings {
  exercises: ExerciseDefinition[];
  dailyNotesFolder: string;
}

export interface BookTrackerSettings {
  books: BookDefinition[];
  dailyNotesFolder: string;
}

export interface LifeCalendarSettings {
  birthDate: string;
  lifespanYears: number;
  journalFolder: string;
  eventsFile: string;
  exportFile: string;
  custom: Record<string, WeekStyle>;
  language: string;
  zones: LifeZone[];
  exerciseTracker: ExerciseTrackerSettings;
  bookTracker: BookTrackerSettings;
}

export interface JournalEntry {
  date: string;
  text: string;
  rawText?: string;
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

export type TrackerType = 'books' | 'exercises' | 'tasks';

export type BookUnit = 'pages' | 'chapters' | 'hours';
export type BookType = 'electronic' | 'paper' | 'audiobook';

export interface BookDefinition {
  id: string;
  name: string;
  author?: string;
  color?: string;
  order: number;
  bookType?: BookType;
}

export interface BookEntry {
  id: string;
  bookId: string;
  name: string;
  author?: string;
  value?: number;
  unit?: BookUnit;
  date: string;
  createdAt: string;
  rating?: number;
  dateStarted?: string;
  dateFinished?: string;
  bookType?: BookType;
  read?: boolean;
}

export interface BookStats {
  totals: Record<string, number>;
  activeDays: number;
  bestStreak: number;
  bestDay: { date: string; value: number } | null;
  monthly: Record<string, MonthlyBookStats>;
  weekly: Record<string, WeeklyBookStats>;
}

export interface MonthlyBookStats {
  yearMonth: string;
  days: number;
  totals: Record<string, number>;
  entries: BookEntry[];
}

export interface WeeklyBookStats {
  weekKey: string;
  startDate: string;
  endDate: string;
  days: number;
  totals: Record<string, number>;
  entries: BookEntry[];
}

export interface TrackerEntry {
  id: string;
  type: TrackerType;
  title: string;
  date: string; // YYYY-MM-DD
  createdAt: string;
  extra?: {
    books?: {
      author?: string;
      pages?: number;
      rating?: number; // 1-5
      dateStarted?: string; // YYYY-MM-DD
      dateFinished?: string; // YYYY-MM-DD
      read: boolean;
    };
    exercises?: {
      durationMinutes: number;
      calories?: number;
      description?: string;
    };
    tasks?: {
      priority: 'low' | 'medium' | 'high';
      status: 'pending' | 'completed';
      dueDate?: string; // YYYY-MM-DD
    };
  };
}

export const DEFAULT_EXERCISE_DEFINITIONS: ExerciseDefinition[] = [
  { id: 'ex1', name: 'Отжимание', defaultUnit: 'reps', order: 0, color: '#e74c3c' },
  { id: 'ex2', name: 'Приседание', defaultUnit: 'reps', order: 1, color: '#3498db' },
  { id: 'ex3', name: 'Гантеля', defaultUnit: 'reps', order: 2, color: '#f39c12' },
  { id: 'ex4', name: 'Пресс', defaultUnit: 'reps', order: 3, color: '#2ecc71' },
  { id: 'ex5', name: 'Бег', defaultUnit: 'km', order: 4, color: '#9b59b6' },
  { id: 'ex6', name: 'Планка', defaultUnit: 'min', order: 5, color: '#e67e22' },
];

export const EXERCISE_UNIT_LABELS: Record<ExerciseUnit, string> = {
  reps: 'повт',
  min: 'мин',
  kg: 'кг',
  km: 'км',
  custom: 'своя',
};

export const EXERCISE_UNIT_OPTIONS: { value: ExerciseUnit; label: string }[] = [
  { value: 'reps', label: 'Повторения' },
  { value: 'min', label: 'Минуты' },
  { value: 'kg', label: 'Килограммы' },
  { value: 'km', label: 'Километры' },
  { value: 'custom', label: 'Своя единица' },
];

export const HEATMAP_COLORS = [
  '#ebedf0',
  '#9be9a8',
  '#40c463',
  '#30a14e',
  '#216e39',
];

export const BOOK_UNIT_LABELS: Record<BookUnit, string> = {
  pages: 'стр',
  chapters: 'глав',
  hours: 'ч',
};

export const BOOK_UNIT_OPTIONS: { value: BookUnit; label: string }[] = [
  { value: 'pages', label: 'Страницы' },
  { value: 'chapters', label: 'Главы' },
  { value: 'hours', label: 'Часы' },
];

export const BOOK_TYPE_OPTIONS: { value: BookType; label: string }[] = [
  { value: 'electronic', label: 'Электронная' },
  { value: 'paper', label: 'Бумажная' },
  { value: 'audiobook', label: 'Аудио' },
];

export const DEFAULT_SETTINGS: LifeCalendarSettings = {
  birthDate: "",
  lifespanYears: 100,
  journalFolder: "Life Calendar/Journal",
  eventsFile: "Life Calendar/Events.md",
  exportFile: "Life Calendar/backup.json",
  custom: {},
  language: "",
  zones: [],
  exerciseTracker: {
    exercises: DEFAULT_EXERCISE_DEFINITIONS,
    dailyNotesFolder: "daily",
  },
  bookTracker: {
    books: [],
    dailyNotesFolder: "Life Calendar/Journal",
  },
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