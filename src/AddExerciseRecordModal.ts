import { App, Modal, Notice } from "obsidian";
import { ExerciseDefinition, ExerciseEntry, ExerciseUnit, EXERCISE_UNIT_OPTIONS } from "./types";
import { ExerciseTrackerStore } from "./services/ExerciseTrackerStore";
import { t } from "./i18n";
import { todayKey } from "./date";

/** Модалка добавления записи трэкера упражнений. */
export class AddExerciseRecordModal extends Modal {
  private exercises: ExerciseDefinition[] = [];

  constructor(
    app: App,
    private exerciseTrackerStore: ExerciseTrackerStore,
    private onSave: (entry: ExerciseEntry) => Promise<void>,
  ) {
    super(app);
  }

  async onOpen(): Promise<void> {
    this.exercises = this.exerciseTrackerStore.getExercises();
    
    const { contentEl } = this;
    contentEl.addClass("lc-modal");
    contentEl.createEl("h3", { text: t("exerciseAddRecord") });

    // Exercise selector
    const nameWrap = contentEl.createDiv({ cls: "lc-modal-field" });
    nameWrap.createEl("label", { text: t("exerciseName") });
    const nameSelect = nameWrap.createEl("select", { cls: "lc-modal-text" });
    nameSelect.createEl("option", { text: t("exerciseSelectPlaceholder"), value: "" });
    for (const ex of this.exercises) {
      const opt = nameSelect.createEl("option", { text: ex.name });
      opt.value = ex.id;
    }

    // Custom exercise name input (hidden by default)
    const customNameWrap = contentEl.createDiv({ cls: "lc-modal-field lc-hidden" });
    customNameWrap.createEl("label", { text: t("exerciseName") });
    const customNameInput = customNameWrap.createEl("input", {
      cls: "lc-modal-text",
      attr: { placeholder: t("exerciseSelectPlaceholder") },
    });

    // Value input
    const valueWrap = contentEl.createDiv({ cls: "lc-modal-field" });
    valueWrap.createEl("label", { text: t("exerciseValue") });
    const valueInput = valueWrap.createEl("input", {
      cls: "lc-modal-text",
      attr: { placeholder: t("exerciseEnterValue"), type: "number", step: "0.1", min: "0" },
    });

    // Unit selector
    const unitWrap = contentEl.createDiv({ cls: "lc-modal-field" });
    unitWrap.createEl("label", { text: t("exerciseUnit") });
    const unitSelect = unitWrap.createEl("select", { cls: "lc-modal-text" });
    for (const opt of EXERCISE_UNIT_OPTIONS) {
      const option = unitSelect.createEl("option", { text: opt.label });
      option.value = opt.value;
    }

    // Custom unit input (hidden by default)
    const customUnitWrap = contentEl.createDiv({ cls: "lc-modal-field lc-hidden" });
    customUnitWrap.createEl("label", { text: t("exerciseCustomUnit") });
    const customUnitInput = customUnitWrap.createEl("input", {
      cls: "lc-modal-text",
      attr: { placeholder: "например: круги, подходы" },
    });

    // Date
    const dateWrap = contentEl.createDiv({ cls: "lc-modal-field" });
    dateWrap.createEl("label", { text: t("exerciseDate") });
    const dateInput = dateWrap.createEl("input", { type: "date" });
    const today = new Date().toISOString().split("T")[0];
    dateInput.value = today;

    // Save/Cancel buttons
    const row = contentEl.createDiv({ cls: "lc-modal-row" });
    const saveBtn = row.createEl("button", { cls: "mod-cta", text: t("save") });
    const cancelBtn = row.createEl("button", { cls: "lc-modal-cancel", text: t("cancel") });

    cancelBtn.addEventListener("click", () => this.close());

    saveBtn.addEventListener("click", () => {
      void (async () => {
      const exId = nameSelect.value;
      const isCustom = !exId;
      const name = isCustom ? customNameInput.value.trim() : (this.exercises.find(e => e.id === nameSelect.value)?.name || "");
      const value = valueInput.valueAsNumber;
      const unit = unitSelect.value as ExerciseUnit;
      const customUnit = unit === 'custom' ? customUnitInput.value.trim() : undefined;
      const date = dateInput.value || todayKey();

      if (!name) {
        new Notice(t("exerciseSelectExercise"));
        return;
      }
      if (!value || value <= 0) {
        new Notice(t("exerciseEnterValue"));
        return;
      }

      // Find or create exercise definition
      let exDef = this.exercises.find(e => e.id === nameSelect.value);
      if (!exDef && !nameSelect.value && name) {
        exDef = {
          id: `custom_${name.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`,
          name,
          defaultUnit: unitSelect.value as ExerciseUnit,
          customUnit,
          order: 999,
        };
        await this.exerciseTrackerStore.addExercise(exDef);
      }

      if (!exDef) {
        new Notice(t("exerciseSelectExercise"));
        return;
      }

      const entry: ExerciseEntry = {
        id: `entry_${Date.now()}`,
        exerciseId: exDef.id,
        name: exDef.name,
        value,
        unit: unitSelect.value as ExerciseUnit,
        customUnit,
        date,
        createdAt: new Date().toISOString(),
      };

      await this.onSave(entry);
      this.close();
      })();
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}