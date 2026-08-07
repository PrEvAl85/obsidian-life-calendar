import { Notice, Plugin } from "obsidian";
import { DEFAULT_SETTINGS, LifeCalendarSettings } from "./types";
import { JournalStore } from "./journal";
import { WeekStore } from "./weekly";
import { EventsStore } from "./events";
import { ExportManager } from "./export";
import { BirthDateModal, setupStructure } from "./onboarding";
import { LifeCalendarSettingTab } from "./settings";
import { LifeCalendarView, VIEW_TYPE_LIFE_CALENDAR } from "./view";
import { AddEntryModal, EventsModal } from "./modals";
import { resolveLanguage, setLanguage, t } from "./i18n";
import { todayKey } from "./date";

export default class LifeCalendarPlugin extends Plugin {
  settings: LifeCalendarSettings = { ...DEFAULT_SETTINGS };
  journal!: JournalStore;
  week!: WeekStore;
  events!: EventsStore;
  export!: ExportManager;

  async onload(): Promise<void> {
    await this.loadSettings();
    setLanguage(resolveLanguage(this.settings.language));

    this.journal = new JournalStore(this.app, () => this.settings);
    this.week = new WeekStore(this.app, () => this.settings);
    this.events = new EventsStore(this.app, () => this.settings);
    this.export = new ExportManager(this.app, () => this.settings);

    this.registerView(VIEW_TYPE_LIFE_CALENDAR, (leaf) => new LifeCalendarView(leaf, this));

    this.addRibbonIcon("heart", t("ribbon"), () => this.openLifeCalendar());

    this.addCommand({
      id: "open-life-calendar",
      name: t("cmdOpen"),
      callback: () => this.openLifeCalendar(),
    });
    this.addCommand({
      id: "add-entry",
      name: t("cmdAddEntry"),
      callback: () => {
        new AddEntryModal(this.app, todayKey(), async (date, text) => {
          try {
            const path = await this.journal.addEntry(date, text);
            new Notice(t("entryAdded", { path }));
          } catch (err: unknown) {
            console.error("Life Calendar: add entry", err);
            new Notice(t("genericError", { error: err instanceof Error ? err.message : String(err) }));
          }
        }).open();
      },
    });
    this.addCommand({
      id: "manage-events",
      name: t("cmdEvents"),
      callback: () => {
        new EventsModal(this.app, () => this.events.read(), (ev) => this.events.write(ev)).open();
      },
    });
    this.addCommand({
      id: "export-android",
      name: t("cmdExport"),
      callback: () => this.exportForAndroid(),
    });

    this.addSettingTab(new LifeCalendarSettingTab(this.app, this));

    // Автообновление сетки при изменении дневника или событий
    this.registerEvent(this.app.vault.on("modify", (file) => this.onVaultChange(file.path)));
    this.registerEvent(this.app.vault.on("create", (file) => this.onVaultChange(file.path)));
    this.registerEvent(this.app.vault.on("delete", (file) => this.onVaultChange(file.path)));

    if (!this.settings.birthDate) {
      window.setTimeout(() => {
        if (this.settings.birthDate) return;
        const modal = new BirthDateModal(this.app, this.settings, async () => {
          await setupStructure(this.app, this.settings);
          await this.saveSettings();
          new Notice(t("onboardingDone"));
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
    this.settings = Object.assign({}, DEFAULT_SETTINGS, (await this.loadData()) as Partial<LifeCalendarSettings>);
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  async openLifeCalendar(): Promise<void> {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_LIFE_CALENDAR);
    if (leaves.length) {
      this.app.workspace.setActiveLeaf(leaves[0], { focus: true });
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

  private refreshTimer: number | null = null;

  private onVaultChange(path: string): void {
    const journalPrefix = this.settings.journalFolder + "/";
    const isRelevant =
      path.startsWith(journalPrefix) && path.endsWith(".md") || path === this.settings.eventsFile;
    if (!isRelevant) return;
    if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
    this.refreshTimer = window.setTimeout(() => {
      this.refreshTimer = null;
      this.refreshViews();
    }, 300);
  }

  async exportForAndroid(): Promise<void> {
    try {
      const entries = await this.journal.listAll();
      const events = await this.events.read();
      const json = this.export.buildJson(entries, events);
      const path = await this.export.writeBackup(json);
      new Notice(
        t("exportDone", { path, entries: entries.length, events: events.length }),
        6000,
      );
    } catch (err: unknown) {
      console.error("Life Calendar: export", err);
      new Notice(t("exportError", { error: err instanceof Error ? err.message : String(err) }));
    }
  }
}
