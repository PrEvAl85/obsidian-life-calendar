/**
 * Локализация плагина. Текущий язык хранится в модуле; при смене языка
 * (настройки или авто по языку Obsidian) вызывается setLanguage + refreshViews.
 */

export type Language = "ru" | "en";

const ru = {
  // Общие
  cancel: "Отмена",
  save: "Сохранить",
  close: "Закрыть",
  delete: "Удалить",
  edit: "Редактировать",
  date: "Дата",
  text: "Текст",
  color: "Цвет",
  title: "Название",
  invalidDate: "Неверная дата",
  weekNoEntries: "В этой неделе нет записей",

  // Команды и риббон
  cmdOpen: "Открыть Life Calendar",
  cmdAddEntry: "Добавить запись в дневник",
  cmdEvents: "События (добавить / редактировать / удалить)",
  cmdZones: "Зоны (добавить / редактировать / удалить)",
  cmdExport: "Экспорт резервной копии (JSON)",
  cmdImport: "Импорт из резервной копии (JSON)",
  ribbon: "Life Calendar",

  // Уведомления
  onboardingDone: "Life Calendar: готово! Дата рождения сохранена.",
  entryAdded: "Запись добавлена: {path}",
  exportDone:
    "Экспорт готов: {path}\nЗаписей: {entries}, событий: {events}. Файл можно импортировать в Life Calendar (Android) или в другой vault Obsidian.",
  exportError: "Life Calendar: ошибка экспорта: {error}",
  importSummary:
    "Импорт завершён: записей +{entries}, событий +{events}, зон +{zones}. Пропущено дублей: {skipped}.",
  importEmpty: "Новых данных нет — всё уже импортировано ранее",
  importError: "Life Calendar: ошибка импорта: {error}",
  importInvalidBackup: "Неверный формат файла резервной копии",
  importFileNotFound: "Файл не найден",
  genericError: "Life Calendar: {error}",
  colorsReset: "Life Calendar: цвета и кольца сброшены",
  weekCreateError: "Life Calendar: не удалось создать недельную заметку",
  birthDateRequired: "Укажите дату рождения",
  invalidDateFormat: "Неверный формат даты (нужен ГГГГ-ММ-ДД)",
  enterEntryText: "Введите текст записи",
  enterEventTitle: "Введите название события",
  noBirthDate: "Укажите дату рождения в настройках плагина.",
  invalidBirthDate: "Неверная дата рождения.",
  insertLink: "Ссылка",
  insertImage: "Изображение",
  imageFromVault: "Из хранилища",
  imageFromComputer: "С компьютера",
  imageSelectTitle: "Выбор изображения",
  imageDropZone: "Перетащите файл сюда или нажмите для выбора",
  imageImporting: "Импорт изображения…",
  imageImportError: "Ошибка импорта изображения: {error}",

  // Онбординг
  welcome:
    "Добро пожаловать! Для построения календаря жизни введите вашу дату рождения. " +
    "Плагин создаст папки для дневника, событий и экспорта.",
  requiredField: "Обязательное поле",
  start: "Начать",

  // Сетка / view
  addEntryBtn: "➕ Запись в дневник",
  eventsBtn: "События",
  zonesBtn: "🎨 Зоны",
  feedBtn: "📜 Поток",
  exportBtn: "📤 Экспорт",
  importBtn: "📥 Импорт",
  legend: "Дата рождения: {birth}   Сегодня: {today}   Возраст: {age} лет и {weeks} нед.   Записей в неделях: {weeksWith}",
  birthdaySuffix: " — День рождения 🎂",
  moreEntries: "\n… ещё {n}",

  // Модалки
  addEntryTitle: "Запись в дневник",
  entryTextPlaceholder: "Текст записи…",
  eventsTitle: "События",
  noEvents: "Событий пока нет",
  addBtn: "➕ Добавить",
  editEventTitle: "Редактировать событие",
  newEventTitle: "Новое событие",
  eventTitlePlaceholder: "Название события…",
  weekTitle: "Неделя {start} — {end}",
  weekEntriesSection: "📝 Записи дневника",
  addEntry: "➕ Запись",
  noEntries: "Записей нет",
  up: "Выше",
  down: "Ниже",
  weekEventsSection: "📅 События",
  addEvent: "➕ Событие",
  noEventsWeek: "Событий нет",
  openDayNotes: "📂 Открыть заметки по датам",
  openWeekNote: "📄 Открыть недельную заметку",
  editEntryTitle: "Редактировать запись",
  importModalTitle: "Импорт из резервной копии",
  importFileLabel: "Файл резервной копии (JSON)",
  importBrowse: "Обзор…",
  importApplyMeta: "Применить дату рождения и срок жизни из файла",

  // Поток (Feed)
  feedTitle: "Поток записей",
  feedSearchPlaceholder: "Поиск по тексту…",
  feedFilterDateFrom: "С",
  feedFilterDateTo: "По",
  feedFilterHasImages: "Только с изображениями",
  feedSortNewest: "Сначала новые",
  feedSortOldest: "Сначала старые",
  feedNoEntries: "Записей не найдено",
  feedGroupYear: "Год",
  feedGroupMonth: "Месяц",
  feedGroupDay: "День",
  feedEditTooltip: "Редактировать",
  feedDeleteTooltip: "Удалить",
  feedMoveUpTooltip: "Переместить вверх",
  feedMoveDownTooltip: "Переместить вниз",
  feedConfirmDelete: "Удалить эту запись?",
  feedEntryDateFormat: "{date} ({weekday})",

  // Зоны
  zonesTitle: "Зоны",
  noZones: "Зон пока нет",
  newZoneTitle: "Новая зона",
  editZoneTitle: "Редактировать зону",
  zoneName: "Название",
  zoneNamePlaceholder: "Например: Учёба в школе",
  zoneStart: "Дата начала",
  zoneEnd: "Дата конца",
  enterZoneName: "Введите название зоны",
  invalidDateRange: "Дата конца должна быть не раньше даты начала",
  zoneDateRange: "{start} – {end}",

  // Тултип (палитры)
  colorTip: "Цвет сердечка",
  resetColor: "Сбросить цвет",
  resetRing: "Сбросить кольцо",
  ringTip: "Кольцо",

  // Недельные заметки
  weekNoteHead: "{key} — неделя",
  weekJournal: "Журнал",
  weekSource: "Источник",

  // Настройки
  settingsBirthDate: "Дата рождения",
  settingsBirthDateDesc: "Начало отсчёта календаря жизни",
  settingsLifespan: "Продолжительность жизни",
  settingsLifespanDesc: "{min}–{max} лет",
  settingsJournalFolder: "Папка дневника",
  settingsJournalFolderDesc: "Файлы записей по дням (DD.MM.YYYY.md)",
  settingsWeeklyFolder: "Папка недельных заметок",
  settingsWeeklyFolderDesc: "Агрегаторы недель (собираются при клике по неделе)",
  settingsEventsFile: "Файл событий",
  settingsEventsFileDesc: "YAML-frontmatter: date, color, title",
  settingsExportFile: "Файл экспорта",
  settingsExportFileDesc: "JSON-бэкап: импортируется в Life Calendar (Android) и в другой vault Obsidian",
  settingsResetCustom: "Сбросить цвета и кольца сердечек",
  settingsResetCustomDesc: "Удаляет индивидуальные настройки цвета/кольца недель",
  reset: "Сбросить",
  settingsLanguage: "Язык интерфейса",
  settingsLanguageDesc: "По умолчанию — язык Obsidian",
  langAuto: "Авто (язык Obsidian)",
  langRu: "Русский",
  langEn: "English",
  settingsSupport: "Поддержать проект",
  settingsSupportDesc: "Приложение бесплатное и без рекламы. Поддержите разработку:",
  supportBoosty: "☕ Boosty — разовая или ежемесячная поддержка",
  supportDonations: "🍩 DonationAlerts — разовые донаты",
  supportCrypto: "Криптовалюта",
  cryptoUSDT: "USDT (TRC20)",
  cryptoUSDTBEP: "USDT (BEP20)",
  cryptoBTC: "BTC",
  cryptoTON: "TON",
  copy: "Копировать",
  copied: "Скопировано: {value}",
  open: "Открыть",
  settingsContacts: "Контакты",
  settingsContactsDesc: "Вопросы и пожелания — пишите в Telegram:",
  contactTelegram: "Telegram (GraphiCoreOne)",
};

export type Dict = typeof ru;

const en: Dict = {
  cancel: "Cancel",
  save: "Save",
  close: "Close",
  delete: "Delete",
  edit: "Edit",
  date: "Date",
  text: "Text",
  color: "Color",
  title: "Title",
  invalidDate: "Invalid date",
  weekNoEntries: "No entries this week",

  cmdOpen: "Open Life Calendar",
  cmdAddEntry: "Add journal entry",
  cmdEvents: "Events (add / edit / delete)",
  cmdZones: "Zones (add / edit / delete)",
  cmdExport: "Export backup (JSON)",
  cmdImport: "Import from backup (JSON)",
  ribbon: "Life Calendar",

  onboardingDone: "Life Calendar: done! Birth date saved.",
  entryAdded: "Entry added: {path}",
  exportDone:
    "Export ready: {path}\nEntries: {entries}, events: {events}. Import the file into Life Calendar (Android) or another Obsidian vault.",
  exportError: "Life Calendar: export error: {error}",
  importSummary:
    "Import done: entries +{entries}, events +{events}, zones +{zones}. Duplicates skipped: {skipped}.",
  importEmpty: "Nothing new to import — everything is already there",
  importError: "Life Calendar: import error: {error}",
  importInvalidBackup: "Invalid backup file format",
  importFileNotFound: "File not found",
  genericError: "Life Calendar: {error}",
  colorsReset: "Life Calendar: colors and rings reset",
  weekCreateError: "Life Calendar: could not create week note",
  birthDateRequired: "Please enter your birth date",
  invalidDateFormat: "Invalid date format (expected YYYY-MM-DD)",
  enterEntryText: "Please enter entry text",
  enterEventTitle: "Please enter event title",
  noBirthDate: "Set your birth date in plugin settings.",
  invalidBirthDate: "Invalid birth date.",
  insertLink: "Link",
  insertImage: "Image",
  imageFromVault: "From vault",
  imageFromComputer: "From computer",
  imageSelectTitle: "Select image",
  imageDropZone: "Drag file here or click to choose",
  imageImporting: "Importing image…",
  imageImportError: "Image import error: {error}",

  welcome:
    "Welcome! To build your life calendar, enter your birth date. " +
    "The plugin will create folders for the journal, events, and export.",
  requiredField: "Required field",
  start: "Start",

  addEntryBtn: "➕ Journal entry",
  eventsBtn: "Events",
  zonesBtn: "🎨 Zones",
  feedBtn: "📜 Feed",
  exportBtn: "📤 Export",
  importBtn: "📥 Import",
  legend: "Birth date: {birth}   Today: {today}   Age: {age} y {weeks} w.   Weeks with entries: {weeksWith}",
  birthdaySuffix: " — Birthday 🎂",
  moreEntries: "\n… {n} more",

  addEntryTitle: "Journal entry",
  entryTextPlaceholder: "Entry text…",
  eventsTitle: "Events",
  noEvents: "No events yet",
  addBtn: "➕ Add",
  editEventTitle: "Edit event",
  newEventTitle: "New event",
  eventTitlePlaceholder: "Event title…",
  weekTitle: "Week {start} — {end}",
  weekEntriesSection: "📝 Journal entries",
  addEntry: "➕ Entry",
  noEntries: "No entries",
  up: "Up",
  down: "Down",
  weekEventsSection: "📅 Events",
  addEvent: "➕ Event",
  noEventsWeek: "No events",
  openDayNotes: "📂 Open day notes",
  openWeekNote: "📄 Open week note",
  editEntryTitle: "Edit entry",
  importModalTitle: "Import from backup",
  importFileLabel: "Backup file (JSON)",
  importBrowse: "Browse…",
  importApplyMeta: "Apply birth date and lifespan from the file",

  // Feed
  feedTitle: "Entry Feed",
  feedSearchPlaceholder: "Search text…",
  feedFilterDateFrom: "From",
  feedFilterDateTo: "To",
  feedFilterHasImages: "Only with images",
  feedSortNewest: "Newest first",
  feedSortOldest: "Oldest first",
  feedNoEntries: "No entries found",
  feedGroupYear: "Year",
  feedGroupMonth: "Month",
  feedGroupDay: "Day",
  feedEditTooltip: "Edit",
  feedDeleteTooltip: "Delete",
  feedMoveUpTooltip: "Move up",
  feedMoveDownTooltip: "Move down",
  feedConfirmDelete: "Delete this entry?",
  feedEntryDateFormat: "{date} ({weekday})",

  zonesTitle: "Zones",
  noZones: "No zones yet",
  newZoneTitle: "New zone",
  editZoneTitle: "Edit zone",
  zoneName: "Name",
  zoneNamePlaceholder: "e.g. School",
  zoneStart: "Start date",
  zoneEnd: "End date",
  enterZoneName: "Please enter the zone name",
  invalidDateRange: "End date must not be earlier than start date",
  zoneDateRange: "{start} – {end}",

  colorTip: "Heart color",
  resetColor: "Reset color",
  resetRing: "Reset ring",
  ringTip: "Ring",

  weekNoteHead: "{key} — week",
  weekJournal: "Journal",
  weekSource: "Source",

  settingsBirthDate: "Birth date",
  settingsBirthDateDesc: "Start of the life calendar",
  settingsLifespan: "Lifespan",
  settingsLifespanDesc: "{min}–{max} years",
  settingsJournalFolder: "Journal folder",
  settingsJournalFolderDesc: "Per-day entry files (DD.MM.YYYY.md)",
  settingsWeeklyFolder: "Weekly notes folder",
  settingsWeeklyFolderDesc: "Weekly aggregators (built on week click)",
  settingsEventsFile: "Events file",
  settingsEventsFileDesc: "YAML frontmatter: date, color, title",
  settingsExportFile: "Export file",
  settingsExportFileDesc: "JSON backup: importable into Life Calendar (Android) or another Obsidian vault",
  settingsResetCustom: "Reset heart colors and rings",
  settingsResetCustomDesc: "Removes per-week color/ring settings",
  reset: "Reset",
  settingsLanguage: "Interface language",
  settingsLanguageDesc: "Default: Obsidian language",
  langAuto: "Auto (Obsidian language)",
  langRu: "Русский",
  langEn: "English",
  settingsSupport: "Support the project",
  settingsSupportDesc: "The app is free and ad-free. Support the development:",
  supportBoosty: "☕ Boosty — one-time or monthly support",
  supportDonations: "🍩 DonationAlerts — one-time donations",
  supportCrypto: "Cryptocurrency",
  cryptoUSDT: "USDT (TRC20)",
  cryptoUSDTBEP: "USDT (BEP20)",
  cryptoBTC: "BTC",
  cryptoTON: "TON",
  copy: "Copy",
  copied: "Copied: {value}",
  open: "Open",
  settingsContacts: "Contacts",
  settingsContactsDesc: "Questions and suggestions — write to Telegram:",
  contactTelegram: "Telegram (GraphiCoreOne)",
};

const translations: Record<Language, Dict> = { ru, en };

let lang: Language = "ru";

export function setLanguage(l: Language): void {
  lang = l;
}

export function getLanguage(): Language {
  return lang;
}

/**
 * Выбор языка из настройки плагина: "ru"/"en" — явно,
 * "" (или любое другое) — по языку Obsidian (app.getLanguage()), fallback английский.
 */
export function resolveLanguage(pref: string, getObsidianLang: () => string): Language {
  if (pref === "ru") return "ru";
  if (pref === "en") return "en";
  const loc = (getObsidianLang() || navigator.language || "en").toLowerCase();
  return loc.startsWith("ru") ? "ru" : "en";
}

/** Перевод ключа с подстановкой параметров {name}. */
export function t(key: keyof Dict, params?: Record<string, string | number>): string {
  let s = translations[lang][key];
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      s = s.split("{" + k + "}").join(String(v));
    }
  }
  return s;
}

const DAYS_RU = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];
const DAYS_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Название дня недели по индексу (0 = воскресенье). */
export function dayName(i: number): string {
  return lang === "ru" ? DAYS_RU[i] || "" : DAYS_EN[i] || "";
}

const MONTHS_GEN_RU = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];
const MONTHS_GEN_EN = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Название месяца в родительном падеже (для заголовков файлов дня). */
export function monthNameGen(i: number): string {
  return lang === "ru" ? MONTHS_GEN_RU[i] || "" : MONTHS_GEN_EN[i] || "";
}
