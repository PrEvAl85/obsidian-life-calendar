import { App, Modal, Notice, moment } from "obsidian";
import { HEART_COLORS, JournalEntry, LifeEvent } from "./types";
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

/** Обработчики изменений для окна недели. */
export interface WeekHandlers {
  addEntry: (date: string, text: string) => Promise<void>;
  updateEntry: (oldDate: string, index: number, newDate: string, text: string) => Promise<void>;
  deleteEntry: (date: string, index: number) => Promise<void>;
  moveEntry: (date: string, index: number, dir: -1 | 1) => Promise<void>;
  addEvent: (ev: LifeEvent) => Promise<void>;
  updateEvent: (old: LifeEvent, next: LifeEvent) => Promise<void>;
  deleteEvent: (ev: LifeEvent) => Promise<void>;
  openDayNotes: (paths: string[]) => Promise<void>;
  openWeekNote: (entries: JournalEntry[]) => Promise<void>;
}

/** Окно недели: записи дневника и события недели, добавляемые/редактируемые независимо. */
export class WeekModal extends Modal {
  private entries: JournalEntry[] = [];
  private events: LifeEvent[] = [];

  constructor(
    app: App,
    private weekKey: string,
    private load: () => Promise<{ entries: JournalEntry[]; events: LifeEvent[] }>,
    private handlers: WeekHandlers,
  ) {
    super(app);
  }

  async onOpen(): Promise<void> {
    const data = await this.load();
    this.entries = data.entries;
    this.events = data.events;
    this.render();
  }

  private async reload(): Promise<void> {
    const data = await this.load();
    this.entries = data.entries;
    this.events = data.events;
    this.render();
  }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("lc-modal");

    const wkStart = moment(this.weekKey, "YYYY-MM-DD");
    const wkEnd = wkStart.clone().add(6, "days");
    contentEl.createEl("h3", {
      text: `Неделя ${wkStart.format("DD.MM.YYYY")} — ${wkEnd.format("DD.MM.YYYY")}`,
    });

    // --- Записи дневника
    const entriesBlock = contentEl.createDiv({ cls: "lc-week-block" });
    const eHead = entriesBlock.createDiv({ cls: "lc-week-block-head" });
    eHead.createSpan({ cls: "lc-week-block-title", text: "📝 Записи дневника" });
    eHead.createEl("button", { cls: "mod-cta lc-week-add", text: "➕ Запись" }).addEventListener("click", async () => {
      new AddEntryModal(this.app, wkStart.format("YYYY-MM-DD"), async (date, text) => {
        await this.handlers.addEntry(date, text);
        await this.reload();
      }).open();
    });
    const eList = entriesBlock.createDiv({ cls: "lc-week-list" });
    const sortedEntries = [...this.entries].sort(
      (a, b) => a.date.localeCompare(b.date) || a.index - b.index,
    );
    for (const e of sortedEntries) {
      const item = eList.createDiv({ cls: "lc-week-item" });
      const head = item.createDiv({ cls: "lc-week-item-head" });
      head.createSpan({ cls: "lc-week-item-date", text: keyToDmy(e.date) + " (" + weekdayName(e.date) + ")" });
      const btns = head.createDiv({ cls: "lc-week-item-btns" });
      if (e.index > 0) {
        const up = btns.createEl("button", { cls: "lc-week-btn", text: "▲" });
        up.title = "Выше";
        up.addEventListener("click", async () => {
          await this.handlers.moveEntry(e.date, e.index, -1);
          await this.reload();
        });
      }
      if (e.index < e.blocks - 1) {
        const down = btns.createEl("button", { cls: "lc-week-btn", text: "▼" });
        down.title = "Ниже";
        down.addEventListener("click", async () => {
          await this.handlers.moveEntry(e.date, e.index, 1);
          await this.reload();
        });
      }
      const editBtn = btns.createEl("button", { cls: "lc-week-btn", text: "✏️" });
      editBtn.title = "Редактировать";
      editBtn.addEventListener("click", async () => {
        const m = new EntryEditModal(this.app, { date: e.date, text: e.text });
        m.open();
        const res = await m.awaitResult();
        if (res) {
          await this.handlers.updateEntry(e.date, e.index, res.date, res.text);
          await this.reload();
        }
      });
      const delBtn = btns.createEl("button", { cls: "lc-week-btn", text: "🗑" });
      delBtn.title = "Удалить";
      delBtn.addEventListener("click", async () => {
        await this.handlers.deleteEntry(e.date, e.index);
        await this.reload();
      });
      item.createDiv({ cls: "lc-week-item-text", text: e.text });
    }
    if (!this.entries.length) eList.createDiv({ cls: "lc-week-empty", text: "Записей нет" });

    // --- События
    const eventsBlock = contentEl.createDiv({ cls: "lc-week-block" });
    const sHead = eventsBlock.createDiv({ cls: "lc-week-block-head" });
    sHead.createSpan({ cls: "lc-week-block-title", text: "📅 События" });
    sHead.createEl("button", { cls: "mod-cta lc-week-add", text: "➕ Событие" }).addEventListener("click", async () => {
      const m = new EventEditModal(this.app, { date: wkStart.format("YYYY-MM-DD"), color: HEART_COLORS[0], title: "" });
      m.open();
      const res = await m.awaitResult();
      if (res) {
        await this.handlers.addEvent(res);
        await this.reload();
      }
    });
    const sList = eventsBlock.createDiv({ cls: "lc-week-list" });
    for (const ev of this.events) {
      const item = sList.createDiv({ cls: "lc-week-item" });
      const head = item.createDiv({ cls: "lc-week-item-head" });
      const dot = head.createSpan({ cls: "lc-event-dot" });
      dot.style.background = ev.color;
      head.createSpan({ cls: "lc-week-item-date", text: keyToDmy(ev.date) + " (" + weekdayName(ev.date) + ")" });
      head.createSpan({ cls: "lc-week-item-title", text: ev.title });
      const btns = head.createDiv({ cls: "lc-week-item-btns" });
      const editBtn = btns.createEl("button", { cls: "lc-week-btn", text: "✏️" });
      editBtn.title = "Редактировать";
      editBtn.addEventListener("click", async () => {
        const m = new EventEditModal(this.app, ev);
        m.open();
        const res = await m.awaitResult();
        if (res) {
          await this.handlers.updateEvent(ev, res);
          await this.reload();
        }
      });
      const delBtn = btns.createEl("button", { cls: "lc-week-btn", text: "🗑" });
      delBtn.title = "Удалить";
      delBtn.addEventListener("click", async () => {
        await this.handlers.deleteEvent(ev);
        await this.reload();
      });
    }
    if (!this.events.length) sList.createDiv({ cls: "lc-week-empty", text: "Событий нет" });

    const row = contentEl.createDiv({ cls: "lc-modal-row lc-modal-row-between" });
    const left = row.createDiv({ cls: "lc-modal-row-left" });
    const dayBtn = left.createEl("button", { cls: "lc-modal-cancel", text: "📂 Открыть заметки по датам" });
    dayBtn.type = "button";
    dayBtn.addEventListener("click", async () => {
      const paths = [...new Set(this.entries.map((e) => e.path))];
      if (!paths.length) {
        new Notice("В этой неделе нет записей");
        return;
      }
      await this.handlers.openDayNotes(paths);
    });
    const weekBtn = left.createEl("button", { cls: "lc-modal-cancel", text: "📄 Открыть недельную заметку" });
    weekBtn.type = "button";
    weekBtn.addEventListener("click", async () => {
      await this.handlers.openWeekNote(this.entries);
    });
    row.createEl("button", { cls: "lc-modal-cancel", text: "Закрыть" }).addEventListener("click", () => this.close());
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

/** Модалка редактирования записи дневника (дата + текст). */
export class EntryEditModal extends Modal {
  private result: { date: string; text: string } | null = null;
  private resolveFn: ((v: { date: string; text: string } | null) => void) | null = null;
  private promise: Promise<{ date: string; text: string } | null>;

  constructor(
    app: App,
    private initial: { date: string; text: string },
  ) {
    super(app);
    this.promise = new Promise((resolve) => {
      this.resolveFn = resolve;
    });
  }

  awaitResult(): Promise<{ date: string; text: string } | null> {
    return this.promise;
  }

  private finish(v: { date: string; text: string } | null): void {
    this.result = v;
    this.close();
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass("lc-modal");
    contentEl.createEl("h3", { text: "Редактировать запись" });

    const dateWrap = contentEl.createDiv({ cls: "lc-modal-field" });
    dateWrap.createEl("label", { text: "Дата" });
    const dateInput = dateWrap.createEl("input", { type: "date" });
    dateInput.value = this.initial.date;

    const textWrap = contentEl.createDiv({ cls: "lc-modal-field" });
    textWrap.createEl("label", { text: "Текст" });
    const ta = textWrap.createEl("textarea", {
      cls: "lc-modal-textarea",
      attr: { rows: "6", placeholder: "Текст записи…" },
    });
    ta.value = this.initial.text;

    const row = contentEl.createDiv({ cls: "lc-modal-row" });
    row.createEl("button", { cls: "lc-modal-cancel", text: "Отмена" }).addEventListener("click", () => this.finish(null));
    const save = row.createEl("button", { cls: "mod-cta", text: "Сохранить" });

    const doSave = () => {
      const text = ta.value.trim();
      const date = dateInput.value;
      if (!text) {
        new Notice("Введите текст записи");
        return;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        new Notice("Неверная дата");
        return;
      }
      this.finish({ date, text });
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
    if (this.resolveFn) {
      this.resolveFn(this.result);
      this.resolveFn = null;
    }
  }
}
