import { App, Modal, Notice, Setting, TFile } from "obsidian";
import { LifeCalendarSettings } from "./types";

/**
 * Создание структуры плагина при первом включении:
 * папки Journal/ и Weekly/, файл событий.
 */
export async function setupStructure(app: App, settings: LifeCalendarSettings): Promise<void> {
  for (const dir of [settings.journalFolder, settings.weeklyFolder]) {
    if (!dir) continue;
    const folder = app.vault.getAbstractFileByPath(dir);
    if (!folder) {
      try {
        await app.vault.createFolder(dir);
      } catch (e) {
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
      } catch (e) {
        // уже создана
      }
    }
    try {
      await app.vault.create(settings.eventsFile, "---\nevents:\n---\n\n");
    } catch (e) {
      // файл создался параллельно
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
    contentEl.createEl("p", {
      text: "Добро пожаловать! Для построения календаря жизни введите вашу дату рождения. " +
        "Плагин создаст папки для дневника, событий и экспорта.",
    });

    new Setting(contentEl)
      .setName("Дата рождения")
      .setDesc("Обязательное поле")
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
      text: "Начать",
    });
    saveBtn.addEventListener("click", async () => {
      const v = this.birthDate;
      if (!v) {
        new Notice("Укажите дату рождения");
        return;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) {
        new Notice("Неверный формат даты (нужен ГГГГ-ММ-ДД)");
        return;
      }
      this.settings.birthDate = v;
      this.resolved = true;
      await this.onSave();
      this.close();
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
