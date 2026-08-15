import { App, Modal } from "obsidian";
import LifeCalendarPlugin from "./main";
import { t } from "./i18n";
import type { TrackerType } from "./types";

export class TrackersMenuModal extends Modal {
  constructor(app: App, private plugin: LifeCalendarPlugin) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass("lc-modal");
    contentEl.createEl("h3", { text: t("exerciseTrackerTab") });

    const list = contentEl.createDiv({ cls: "lc-tracker-types" });
    const items: [TrackerType, string][] = [
      ["books", t("books")],
      ["exercises", t("exercises")],
    ];

    for (const [type, name] of items) {
      const item = list.createDiv({ cls: "lc-tracker-type-item" });
      item.createEl("span", { text: name });
      item.addEventListener("click", () => {
        if (type === "books") {
          this.plugin.openBookTracker();
        } else {
          this.plugin.openExerciseTracker();
        }
        this.close();
      });
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}