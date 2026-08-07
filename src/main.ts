import { Notice, Plugin, moment } from "obsidian";
import { DEFAULT_SETTINGS, LifeCalendarSettings } from "./types";
import { JournalStore } from "./journal";
import { WeekStore } from "./weekly";
import { EventsStore } from "./events";
import { ExportManager } from "./export";
import { BirthDateModal, setupStructure } from "./onboarding";
import { LifeCalendarSettingTab } from "./settings";
import { LifeCalendarView, VIEW_TYPE_LIFE_CALENDAR } from "./view";
import { AddEntryModal, EventsModal } from "./modals";

export default class LifeCalendarPlugin extends Plugin {
  settings: LifeCalendarSettings = { ...DEFAULT_SETTINGS };
  journal!: JournalStore;
  week!: WeekStore;
  events!: EventsStore;
  export!: ExportManager;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.journal = new JournalStore(this.app, () => this.settings);
    this.week = new WeekStore(this.app, () => this.settings);
    this.events = new EventsStore(this.app, () => this.settings);
    this.export = new ExportManager(this.app, () => this.settings);

    this.registerView(VIEW_TYPE_LIFE_CALENDAR, (leaf) => new LifeCalendarView(leaf, this));

    this.addRibbonIcon("heart", "Life Calendar", () => this.openLifeCalendar());

    this.addCommand({
      id: "open-life-calendar",
      name: "Открыть Life Calendar",
      callback: () => this.openLifeCalendar(),
    });
    this.addCommand({
      id: "add-entry",
      name: "Добавить запись в дневник",
      callback: () => {
        new AddEntryModal(this.app, moment().format("YYYY-MM-DD"), async (date, text) => {
          try {
            const path = await this.journal.addEntry(date, text);
            new Notice("Запись добавлена: " + path);
          } catch (err) {
            console.error("Life Calendar: add entry", err);
            new Notice("Life Calendar: " + (err && err.message ? err.message : err));
          }
        }).open();
      },
    });
    this.addCommand({
      id: "manage-events",
      name: "События (добавить / редактировать / удалить)",
      callback: () => {
        new EventsModal(this.app, () => this.events.read(), (ev) => this.events.write(ev)).open();
      },
    });
    this.addCommand({
      id: "export-android",
      name: "Экспорт для Life Calendar Android",
      callback: () => this.exportForAndroid(),
    });

    this.addSettingTab(new LifeCalendarSettingTab(this.app, this));

    if (!this.settings.birthDate) {
      window.setTimeout(() => {
        if (this.settings.birthDate) return;
        const modal = new BirthDateModal(this.app, this.settings, async () => {
          await setupStructure(this.app, this.settings);
          await this.saveSettings();
          new Notice("Life Calendar: готово! Дата рождения сохранена.");
          this.refreshViews();
        });
        modal.open();
      }, 400);
    }
  }

  onunload(): void {
    // nothing to clean up
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  async openLifeCalendar(): Promise<void> {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_LIFE_CALENDAR);
    if (leaves.length) {
      this.app.workspace.revealLeaf(leaves[0]);
    } else {
      const leaf = this.app.workspace.getLeaf(true);
      await leaf.setViewState({ type: VIEW_TYPE_LIFE_CALENDAR, active: true });
    }
  }

  refreshViews(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_LIFE_CALENDAR)) {
      const view = leaf.view;
      if (view instanceof LifeCalendarView) {
        void view.render();
      }
    }
  }

  async exportForAndroid(): Promise<void> {
    try {
      const entries = await this.journal.listAll();
      const events = await this.events.read();
      const json = this.export.buildJson(entries, events);
      const path = await this.export.writeBackup(json);
      new Notice(
        `Экспорт готов: ${path}\nЗаписей: ${entries.length}, событий: ${events.length}. ` +
          "Импортируйте файл в приложение Life Calendar (Android).",
        6000,
      );
    } catch (err) {
      console.error("Life Calendar: export", err);
      new Notice("Life Calendar: ошибка экспорта: " + (err && err.message ? err.message : err));
    }
  }
}
