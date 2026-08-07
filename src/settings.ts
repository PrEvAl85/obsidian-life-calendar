import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import LifeCalendarPlugin from "./main";
import { LIFESPAN_MAX, LIFESPAN_MIN } from "./types";

export class LifeCalendarSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private plugin: LifeCalendarPlugin,
  ) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Life Calendar" });

    new Setting(containerEl)
      .setName("Дата рождения")
      .setDesc("Начало отсчёта календаря жизни")
      .addText((text) => {
        text.inputEl.type = "date";
        text.inputEl.value = this.plugin.settings.birthDate;
        text.onChange(async (v) => {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return;
          this.plugin.settings.birthDate = v;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Продолжительность жизни")
      .setDesc(`${LIFESPAN_MIN}–${LIFESPAN_MAX} лет`)
      .addSlider((slider) => {
        slider
          .setLimits(LIFESPAN_MIN, LIFESPAN_MAX, 1)
          .setValue(this.plugin.settings.lifespanYears)
          .setDynamicTooltip()
          .onChange(async (v) => {
            this.plugin.settings.lifespanYears = v;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Папка дневника")
      .setDesc("Файлы записей по дням (DD.MM.YYYY.md)")
      .addText((text) =>
        text
          .setPlaceholder("Life Calendar/Journal")
          .setValue(this.plugin.settings.journalFolder)
          .onChange(async (v) => {
            this.plugin.settings.journalFolder = v.trim() || "Life Calendar/Journal";
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Папка недельных заметок")
      .setDesc("Агрегаторы недель (собираются при клике по неделе)")
      .addText((text) =>
        text
          .setPlaceholder("Life Calendar/Weekly")
          .setValue(this.plugin.settings.weeklyFolder)
          .onChange(async (v) => {
            this.plugin.settings.weeklyFolder = v.trim() || "Life Calendar/Weekly";
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Файл событий")
      .setDesc("YAML-frontmatter: date, color, title")
      .addText((text) =>
        text
          .setPlaceholder("Life Calendar/Events.md")
          .setValue(this.plugin.settings.eventsFile)
          .onChange(async (v) => {
            this.plugin.settings.eventsFile = v.trim() || "Life Calendar/Events.md";
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Файл экспорта")
      .setDesc("JSON для приложения Life Calendar (Android)")
      .addText((text) =>
        text
          .setPlaceholder("Life Calendar/backup.json")
          .setValue(this.plugin.settings.exportFile)
          .onChange(async (v) => {
            this.plugin.settings.exportFile = v.trim() || "Life Calendar/backup.json";
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Сбросить цвета и кольца сердечек")
      .setDesc("Удаляет индивидуальные настройки цвета/кольца недель")
      .addButton((btn) =>
        btn.setButtonText("Сбросить").onClick(async () => {
          this.plugin.settings.custom = {};
          await this.plugin.saveSettings();
          new Notice("Life Calendar: цвета и кольца сброшены");
        }),
      );
  }
}
