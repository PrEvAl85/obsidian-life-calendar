import { App, Modal, Notice } from "obsidian";
import { HEART_COLORS, LifeEvent } from "./types";
import { keyToDmy, weekdayName } from "./util";

/** Модалка добавления записи в дневник. */
export class AddEntryModal extends Modal {
  private dateValue: string;
  private saveHandler: (date: string, text: string) => Promise<void>;

  constructor(
    app: App,
    defaultDate: string,
    saveHandler: (date: string, text: string) => Promise<void>,
  ) {
    super(app);
    this.dateValue = defaultDate;
    this.saveHandler = saveHandler;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass("lc-modal");
    contentEl.createEl("h3", { text: "Запись в дневник" });

    const dateWrap = contentEl.createDiv({ cls: "lc-modal-field" });
    dateWrap.createEl("label", { text: "Дата" });
    const dateInput = dateWrap.createEl("input", { type: "date" });
    dateInput.value = this.dateValue;
    dateInput.addEventListener("change", () => {
      this.dateValue = dateInput.value;
    });

    const textWrap = contentEl.createDiv({ cls: "lc-modal-field" });
    textWrap.createEl("label", { text: "Текст" });
    const ta = textWrap.createEl("textarea", {
      cls: "lc-modal-textarea",
      attr: { rows: "6", placeholder: "Текст записи…" },
    });

    const row = contentEl.createDiv({ cls: "lc-modal-row" });
    row.createEl("button", { cls: "lc-modal-cancel", text: "Отмена" }).addEventListener("click", () => this.close());
    const save = row.createEl("button", { cls: "mod-cta", text: "Сохранить" });

    const doSave = async () => {
      const text = ta.value.trim();
      if (!text) {
        new Notice("Введите текст записи");
        return;
      }
      try {
        await this.saveHandler(this.dateValue, text);
        this.close();
      } catch (err) {
        console.error("Life Calendar: add entry", err);
        new Notice("Life Calendar: " + (err && err.message ? err.message : err));
      }
    };
    save.addEventListener("click", doSave);
    ta.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        doSave();
      }
    });
    ta.focus();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

/** Модалка управления событиями: список + добавление/редактирование/удаление. */
export class EventsModal extends Modal {
  private events: LifeEvent[] = [];

  constructor(
    app: App,
    private load: () => Promise<LifeEvent[]>,
    private save: (events: LifeEvent[]) => Promise<void>,
  ) {
    super(app);
  }

  async onOpen(): Promise<void> {
    this.events = await this.load();
    this.render();
  }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("lc-modal");
    contentEl.createEl("h3", { text: "События" });

    const list = contentEl.createDiv({ cls: "lc-events-list" });
    for (const ev of this.events) {
      const item = list.createDiv({ cls: "lc-event-item" });
      const dot = item.createDiv({ cls: "lc-event-dot" });
      dot.style.background = ev.color;
      item.createSpan({ cls: "lc-event-date", text: keyToDmy(ev.date) + " (" + weekdayName(ev.date) + ")" });
      item.createSpan({ cls: "lc-event-title", text: ev.title });
      const del = item.createEl("button", { cls: "lc-event-del", text: "🗑" });
      del.title = "Удалить";
      del.addEventListener("click", async () => {
        this.events = this.events.filter((x) => !(x.date === ev.date && x.title === ev.title));
        await this.save(this.events);
        this.render();
      });
      item.addEventListener("click", async (e) => {
        if (e.target === del) return;
        const editModal = new EventEditModal(this.app, ev);
        editModal.open();
        const edited = await editModal.awaitResult();
        if (edited) {
          this.events = this.events.map((x) =>
            x.date === ev.date && x.title === ev.title ? edited : x,
          );
          this.events.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
          await this.save(this.events);
          this.render();
        }
      });
    }
    if (!this.events.length) {
      list.createDiv({ cls: "lc-events-empty", text: "Событий пока нет" });
    }

    const row = contentEl.createDiv({ cls: "lc-modal-row" });
    row.createEl("button", { cls: "mod-cta", text: "➕ Добавить" }).addEventListener("click", async () => {
      const addModal = new EventEditModal(this.app, null);
      addModal.open();
      const added = await addModal.awaitResult();
      if (added) {
        this.events.push(added);
        this.events.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
        await this.save(this.events);
        this.render();
      }
    });
    row.createEl("button", { cls: "lc-modal-cancel", text: "Закрыть" }).addEventListener("click", () => this.close());
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

/** Модалка редактирования/добавления одного события. */
class EventEditModal extends Modal {
  private result: LifeEvent | null = null;
  private resolveFn: ((v: LifeEvent | null) => void) | null = null;
  private promise: Promise<LifeEvent | null>;

  constructor(
    app: App,
    private initial: LifeEvent | null,
  ) {
    super(app);
    this.promise = new Promise((resolve) => {
      this.resolveFn = resolve;
    });
  }

  awaitResult(): Promise<LifeEvent | null> {
    return this.promise;
  }

  private finish(v: LifeEvent | null): void {
    this.result = v;
    this.close();
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass("lc-modal");
    contentEl.createEl("h3", { text: this.initial ? "Редактировать событие" : "Новое событие" });

    const dateWrap = contentEl.createDiv({ cls: "lc-modal-field" });
    dateWrap.createEl("label", { text: "Дата" });
    const dateInput = dateWrap.createEl("input", { type: "date" });
    dateInput.value = this.initial ? this.initial.date : window.moment().format("YYYY-MM-DD");

    const titleWrap = contentEl.createDiv({ cls: "lc-modal-field" });
    titleWrap.createEl("label", { text: "Название" });
    const titleInput = titleWrap.createEl("input", {
      cls: "lc-modal-text",
      attr: { placeholder: "Название события…" },
    });
    titleInput.value = this.initial ? this.initial.title : "";

    const colorWrap = contentEl.createDiv({ cls: "lc-modal-field" });
    colorWrap.createEl("label", { text: "Цвет" });
    const colors = colorWrap.createDiv({ cls: "lc-event-colors" });
    let color = this.initial ? this.initial.color : HEART_COLORS[0];
    for (const c of HEART_COLORS) {
      const sw = colors.createDiv({ cls: "lc-event-color-swatch" });
      sw.style.background = c;
      sw.setAttribute("data-c", c);
      if (c === color) sw.addClass("sel");
      sw.addEventListener("click", () => {
        color = c;
        colors.querySelectorAll(".lc-event-color-swatch").forEach((x) => x.removeClass("sel"));
        sw.addClass("sel");
      });
    }

    const row = contentEl.createDiv({ cls: "lc-modal-row" });
    row.createEl("button", { cls: "lc-modal-cancel", text: "Отмена" }).addEventListener("click", () => {
      this.finish(null);
    });
    const save = row.createEl("button", { cls: "mod-cta", text: "Сохранить" });
    save.addEventListener("click", () => {
      const title = titleInput.value.trim();
      const date = dateInput.value;
      if (!title) {
        new Notice("Введите название события");
        return;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        new Notice("Неверная дата");
        return;
      }
      this.finish({ date, color, title });
    });
  }

  onClose(): void {
    this.contentEl.empty();
    if (this.resolveFn) {
      this.resolveFn(this.result);
      this.resolveFn = null;
    }
  }
}
