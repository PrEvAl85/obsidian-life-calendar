import { App, Modal, Notice, Setting, TFile } from "obsidian";
import { LifeCalendarSettings } from "./types";
import { t } from "./i18n";
import { TrackerStore } from "./services/TrackerStore";

/**
 * Создание структуры плагина при первом включении:
 * папка Journal/, файл событий, папка Trackers.
 */
export async function setupStructure(app: App, settings: LifeCalendarSettings): Promise<void> {
  for (const dir of [settings.journalFolder]) {
    if (!dir) continue;
    const folder = app.vault.getAbstractFileByPath(dir);
    if (!folder) {
      try {
        await app.vault.createFolder(dir);
      } catch {
        // уже создана
      }
    }
  }
  const ev = app.vault.getAbstractFileByPath(settings.eventsFile) as TFile | null;
  if (!ev) {
    const dir = settings.eventsFile.replace(/[^/]+$/, "").replace(/\/$/, "");
    if (dir && !app.vault.getAbstractFileByPath(dir)) {
      try {
        await app.vault.createFolder(dir);
      } catch {
        // уже создана
      }
    }
    try {
      await app.vault.create(settings.eventsFile, "---\nevents:\n---\n\n");
    } catch {
      // файл создался параллельно
    }
  }
  // Создаем папку трекеров (если её нет)
  const trackersDir = app.vault.getAbstractFileByPath("Life Calendar/Trackers");
  if (!trackersDir) {
    try {
      await app.vault.createFolder("Life Calendar/Trackers");
      // Создаем пустые файлы для каждого типа трекеров
      const trackerStore = new TrackerStore(app);
      // Инициализируем файлы
      await trackerStore.saveEntries("books", []);
      await trackerStore.saveEntries("exercises", []);
      await trackerStore.saveEntries("tasks", []);
    } catch {
      // папка уже создана параллельно
    }
  }
}

/** Модалка ввода даты рождения при первом включении. */
export class BirthDateModal extends Modal {
  private birthDate = "";
  private resolved = false;

  constructor(
    app: App,
    private settings: LifeCalendarSettings,
    private onSave: () => Promise<void>,
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass("lc-onboarding");
    contentEl.createEl("h3", { text: "Life Calendar" });
    contentEl.createEl("p", { text: t("welcome") });

    new Setting(contentEl)
      .setName(t("date"))
      .setDesc(t("requiredField"))
      .addText((text) => {
        text.inputEl.type = "date";
        text.inputEl.value = "1990-01-01";
        this.birthDate = "1990-01-01";
        text.onChange((v) => {
          this.birthDate = v;
        });
      });

    const btnRow = contentEl.createDiv({ cls: "lc-onboarding-actions" });
    const saveBtn = btnRow.createEl("button", {
      cls: "mod-cta",
      text: t("start"),
    });
    saveBtn.addEventListener("click", () => {
      void (async () => {
        const v = this.birthDate;
        if (!v) {
          new Notice(t("birthDateRequired"));
          return;
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) {
          new Notice(t("invalidDateFormat"));
          return;
        }
        this.settings.birthDate = v;
        this.resolved = true;
        await this.onSave();
        this.close();
      })();
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }

  /** true, если пользователь ввёл дату (не просто закрыл окно). */
  get wasResolved(): boolean {
    return this.resolved;
  }
}
