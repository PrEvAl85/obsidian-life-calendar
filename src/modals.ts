import { App, Modal, Notice, TFile } from "obsidian";
import { addDays, formatKey, todayKey } from "./date";
import { HEART_COLORS, JournalEntry, LifeEvent, LifeZone, ZONE_COLORS } from "./types";
import { keyToDmy, weekdayName } from "./util";
import { t } from "./i18n";
import { ImportResult, InvalidBackupError } from "./import";

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
    contentEl.createEl("h3", { text: t("addEntryTitle") });

    const dateWrap = contentEl.createDiv({ cls: "lc-modal-field" });
    dateWrap.createEl("label", { text: t("date") });
    const dateInput = dateWrap.createEl("input", { type: "date" });
    dateInput.value = this.dateValue;
    dateInput.addEventListener("change", () => {
      this.dateValue = dateInput.value;
    });

    const textWrap = contentEl.createDiv({ cls: "lc-modal-field" });
    textWrap.createEl("label", { text: t("text") });
    const ta = textWrap.createEl("textarea", {
      cls: "lc-modal-textarea",
      attr: { rows: "6", placeholder: t("entryTextPlaceholder") },
    });

    const row = contentEl.createDiv({ cls: "lc-modal-row" });
    row.createEl("button", { cls: "lc-modal-cancel", text: t("cancel") }).addEventListener("click", () => this.close());
    const save = row.createEl("button", { cls: "mod-cta", text: t("save") });

    const doSave = async () => {
      const text = ta.value.trim();
      if (!text) {
        new Notice(t("enterEntryText"));
        return;
      }
      try {
        await this.saveHandler(this.dateValue, text);
        this.close();
      } catch (err: unknown) {
        console.error("Life Calendar: add entry", err);
        new Notice(t("genericError", { error: err instanceof Error ? err.message : String(err) }));
      }
    };
    save.addEventListener("click", () => void doSave());
    ta.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        void doSave();
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
    contentEl.createEl("h3", { text: t("eventsTitle") });

    const list = contentEl.createDiv({ cls: "lc-events-list" });
    for (const ev of this.events) {
      const item = list.createDiv({ cls: "lc-event-item" });
      const dot = item.createDiv({ cls: "lc-event-dot" });
      dot.style.background = ev.color;
      item.createSpan({ cls: "lc-event-date", text: keyToDmy(ev.date) + " (" + weekdayName(ev.date) + ")" });
      item.createSpan({ cls: "lc-event-title", text: ev.title });
      const del = item.createEl("button", { cls: "lc-event-del", text: "🗑" });
      del.title = t("delete");
      del.addEventListener("click", () => {
        void (async () => {
          this.events = this.events.filter((x) => !(x.date === ev.date && x.title === ev.title));
          await this.save(this.events);
          this.render();
        })();
      });
      item.addEventListener("click", (e) => {
        void (async () => {
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
        })();
      });
    }
    if (!this.events.length) {
      list.createDiv({ cls: "lc-events-empty", text: t("noEvents") });
    }

    const row = contentEl.createDiv({ cls: "lc-modal-row" });
    row.createEl("button", { cls: "mod-cta", text: t("addBtn") }).addEventListener("click", () => {
      void (async () => {
        const addModal = new EventEditModal(this.app, null);
        addModal.open();
        const added = await addModal.awaitResult();
        if (added) {
          this.events.push(added);
          this.events.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
          await this.save(this.events);
          this.render();
        }
      })();
    });
    row.createEl("button", { cls: "lc-modal-cancel", text: t("close") }).addEventListener("click", () => this.close());
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

/** Модалка управления зонами: список + добавление/редактирование/удаление. */
export class ZonesModal extends Modal {
  private zones: LifeZone[] = [];

  constructor(
    app: App,
    private load: () => LifeZone[],
    private save: (zones: LifeZone[]) => Promise<void>,
  ) {
    super(app);
  }

  onOpen(): void {
    this.zones = this.load();
    this.render();
  }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("lc-modal");
    contentEl.createEl("h3", { text: t("zonesTitle") });

    const list = contentEl.createDiv({ cls: "lc-events-list" });
    const sorted = [...this.zones].sort((a, b) => a.start.localeCompare(b.start));
    for (const z of sorted) {
      const item = list.createDiv({ cls: "lc-event-item" });
      const dot = item.createDiv({ cls: "lc-event-dot" });
      dot.style.background = z.color;
      item.createSpan({
        cls: "lc-event-date",
        text: t("zoneDateRange", { start: formatKey(z.start), end: formatKey(z.end) }),
      });
      item.createSpan({ cls: "lc-event-title", text: z.title });
      const del = item.createEl("button", { cls: "lc-event-del", text: "🗑" });
      del.title = t("delete");
      del.addEventListener("click", () => {
        void (async () => {
          this.zones = this.zones.filter((x) => x.id !== z.id);
          await this.save(this.zones);
          this.render();
        })();
      });
      item.addEventListener("click", (e) => {
        void (async () => {
          if (e.target === del) return;
          const editModal = new ZoneEditModal(this.app, z);
          editModal.open();
          const edited = await editModal.awaitResult();
          if (edited) {
            this.zones = this.zones.map((x) => (x.id === z.id ? edited : x));
            await this.save(this.zones);
            this.render();
          }
        })();
      });
    }
    if (!this.zones.length) {
      list.createDiv({ cls: "lc-events-empty", text: t("noZones") });
    }

    const row = contentEl.createDiv({ cls: "lc-modal-row" });
    row.createEl("button", { cls: "mod-cta", text: t("addBtn") }).addEventListener("click", () => {
      void (async () => {
        const addModal = new ZoneEditModal(this.app, null);
        addModal.open();
        const added = await addModal.awaitResult();
        if (added) {
          this.zones.push(added);
          await this.save(this.zones);
          this.render();
        }
      })();
    });
    row.createEl("button", { cls: "lc-modal-cancel", text: t("close") }).addEventListener("click", () => this.close());
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

/** Модалка редактирования/добавления одной зоны. */
class ZoneEditModal extends Modal {
  private result: LifeZone | null = null;
  private resolveFn: ((v: LifeZone | null) => void) | null = null;
  private promise: Promise<LifeZone | null>;

  constructor(
    app: App,
    private initial: LifeZone | null,
  ) {
    super(app);
    this.promise = new Promise((resolve) => {
      this.resolveFn = resolve;
    });
  }

  awaitResult(): Promise<LifeZone | null> {
    return this.promise;
  }

  private finish(v: LifeZone | null): void {
    this.result = v;
    this.close();
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass("lc-modal");
    contentEl.createEl("h3", { text: this.initial ? t("editZoneTitle") : t("newZoneTitle") });

    const titleWrap = contentEl.createDiv({ cls: "lc-modal-field" });
    titleWrap.createEl("label", { text: t("zoneName") });
    const titleInput = titleWrap.createEl("input", {
      cls: "lc-modal-text",
      attr: { placeholder: t("zoneNamePlaceholder") },
    });
    titleInput.value = this.initial ? this.initial.title : "";

    const startWrap = contentEl.createDiv({ cls: "lc-modal-field" });
    startWrap.createEl("label", { text: t("zoneStart") });
    const startInput = startWrap.createEl("input", { type: "date" });
    startInput.value = this.initial ? this.initial.start : todayKey();

    const endWrap = contentEl.createDiv({ cls: "lc-modal-field" });
    endWrap.createEl("label", { text: t("zoneEnd") });
    const endInput = endWrap.createEl("input", { type: "date" });
    endInput.value = this.initial ? this.initial.end : todayKey();

    const colorWrap = contentEl.createDiv({ cls: "lc-modal-field" });
    colorWrap.createEl("label", { text: t("color") });
    const colors = colorWrap.createDiv({ cls: "lc-event-colors" });
    let color = this.initial ? this.initial.color : ZONE_COLORS[0];
    for (const c of ZONE_COLORS) {
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
    row.createEl("button", { cls: "lc-modal-cancel", text: t("cancel") }).addEventListener("click", () => {
      this.finish(null);
    });
    const save = row.createEl("button", { cls: "mod-cta", text: t("save") });
    save.addEventListener("click", () => {
      const title = titleInput.value.trim();
      const start = startInput.value;
      const end = endInput.value;
      if (!title) {
        new Notice(t("enterZoneName"));
        return;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
        new Notice(t("invalidDate"));
        return;
      }
      if (end < start) {
        new Notice(t("invalidDateRange"));
        return;
      }
      const base = this.initial;
      this.finish({
        id: base ? base.id : "z" + Date.now().toString(36),
        title,
        start,
        end,
        color,
      });
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
    contentEl.createEl("h3", { text: this.initial ? t("editEventTitle") : t("newEventTitle") });

    const dateWrap = contentEl.createDiv({ cls: "lc-modal-field" });
    dateWrap.createEl("label", { text: t("date") });
    const dateInput = dateWrap.createEl("input", { type: "date" });
    dateInput.value = this.initial ? this.initial.date : todayKey();

    const titleWrap = contentEl.createDiv({ cls: "lc-modal-field" });
    titleWrap.createEl("label", { text: t("title") });
    const titleInput = titleWrap.createEl("input", {
      cls: "lc-modal-text",
      attr: { placeholder: t("eventTitlePlaceholder") },
    });
    titleInput.value = this.initial ? this.initial.title : "";

    const colorWrap = contentEl.createDiv({ cls: "lc-modal-field" });
    colorWrap.createEl("label", { text: t("color") });
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
    row.createEl("button", { cls: "lc-modal-cancel", text: t("cancel") }).addEventListener("click", () => {
      this.finish(null);
    });
    const save = row.createEl("button", { cls: "mod-cta", text: t("save") });
    save.addEventListener("click", () => {
      const title = titleInput.value.trim();
      const date = dateInput.value;
      if (!title) {
        new Notice(t("enterEventTitle"));
        return;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        new Notice(t("invalidDate"));
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

    const wkStart = this.weekKey;
    const wkEnd = addDays(wkStart, 6);
    contentEl.createEl("h3", {
      text: t("weekTitle", {
        start: formatKey(wkStart),
        end: formatKey(wkEnd),
      }),
    });

    // --- Записи дневника
    const entriesBlock = contentEl.createDiv({ cls: "lc-week-block" });
    const eHead = entriesBlock.createDiv({ cls: "lc-week-block-head" });
    eHead.createSpan({ cls: "lc-week-block-title", text: t("weekEntriesSection") });
    eHead.createEl("button", { cls: "mod-cta lc-week-add", text: t("addEntry") }).addEventListener("click", () => {
      void (async () => {
        new AddEntryModal(this.app, wkStart, async (date, text) => {
          await this.handlers.addEntry(date, text);
          await this.reload();
        }).open();
      })();
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
        up.title = t("up");
        up.addEventListener("click", () => {
          void (async () => {
            await this.handlers.moveEntry(e.date, e.index, -1);
            await this.reload();
          })();
        });
      }
      if (e.index < e.blocks - 1) {
        const down = btns.createEl("button", { cls: "lc-week-btn", text: "▼" });
        down.title = t("down");
        down.addEventListener("click", () => {
          void (async () => {
            await this.handlers.moveEntry(e.date, e.index, 1);
            await this.reload();
          })();
        });
      }
      const editBtn = btns.createEl("button", { cls: "lc-week-btn", text: "✏️" });
      editBtn.title = t("edit");
      editBtn.addEventListener("click", () => {
        void (async () => {
          const m = new EntryEditModal(this.app, { date: e.date, text: e.text });
          m.open();
          const res = await m.awaitResult();
          if (res) {
            await this.handlers.updateEntry(e.date, e.index, res.date, res.text);
            await this.reload();
          }
        })();
      });
      const delBtn = btns.createEl("button", { cls: "lc-week-btn", text: "🗑" });
      delBtn.title = t("delete");
      delBtn.addEventListener("click", () => {
        void (async () => {
          await this.handlers.deleteEntry(e.date, e.index);
          await this.reload();
        })();
      });
      item.createDiv({ cls: "lc-week-item-text", text: e.text });
    }
    if (!this.entries.length) eList.createDiv({ cls: "lc-week-empty", text: t("noEntries") });

    // --- События
    const eventsBlock = contentEl.createDiv({ cls: "lc-week-block" });
    const sHead = eventsBlock.createDiv({ cls: "lc-week-block-head" });
    sHead.createSpan({ cls: "lc-week-block-title", text: t("weekEventsSection") });
    sHead.createEl("button", { cls: "mod-cta lc-week-add", text: t("addEvent") }).addEventListener("click", () => {
      void (async () => {
        const m = new EventEditModal(this.app, { date: wkStart, color: HEART_COLORS[0], title: "" });
        m.open();
        const res = await m.awaitResult();
        if (res) {
          await this.handlers.addEvent(res);
          await this.reload();
        }
      })();
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
      editBtn.title = t("edit");
      editBtn.addEventListener("click", () => {
        void (async () => {
          const m = new EventEditModal(this.app, ev);
          m.open();
          const res = await m.awaitResult();
          if (res) {
            await this.handlers.updateEvent(ev, res);
            await this.reload();
          }
        })();
      });
      const delBtn = btns.createEl("button", { cls: "lc-week-btn", text: "🗑" });
      delBtn.title = t("delete");
      delBtn.addEventListener("click", () => {
        void (async () => {
          await this.handlers.deleteEvent(ev);
          await this.reload();
        })();
      });
    }
    if (!this.events.length) sList.createDiv({ cls: "lc-week-empty", text: t("noEventsWeek") });

    const row = contentEl.createDiv({ cls: "lc-modal-row lc-modal-row-between" });
    const left = row.createDiv({ cls: "lc-modal-row-left" });
    const dayBtn = left.createEl("button", { cls: "lc-modal-cancel", text: t("openDayNotes") });
    dayBtn.type = "button";
    dayBtn.addEventListener("click", () => {
      void (async () => {
        const paths = [...new Set(this.entries.map((e) => e.path))];
        if (!paths.length) {
          new Notice(t("weekNoEntries"));
          return;
        }
        await this.handlers.openDayNotes(paths);
      })();
    });
    const weekBtn = left.createEl("button", { cls: "lc-modal-cancel", text: t("openWeekNote") });
    weekBtn.type = "button";
    weekBtn.addEventListener("click", () => {
      void (async () => {
        await this.handlers.openWeekNote(this.entries);
      })();
    });
    row.createEl("button", { cls: "lc-modal-cancel", text: t("close") }).addEventListener("click", () => this.close());
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
    contentEl.createEl("h3", { text: t("editEntryTitle") });

    const dateWrap = contentEl.createDiv({ cls: "lc-modal-field" });
    dateWrap.createEl("label", { text: t("date") });
    const dateInput = dateWrap.createEl("input", { type: "date" });
    dateInput.value = this.initial.date;

    const textWrap = contentEl.createDiv({ cls: "lc-modal-field" });
    textWrap.createEl("label", { text: t("text") });
    const ta = textWrap.createEl("textarea", {
      cls: "lc-modal-textarea",
      attr: { rows: "6", placeholder: t("entryTextPlaceholder") },
    });
    ta.value = this.initial.text;

    const row = contentEl.createDiv({ cls: "lc-modal-row" });
    row.createEl("button", { cls: "lc-modal-cancel", text: t("cancel") }).addEventListener("click", () => this.finish(null));
    const save = row.createEl("button", { cls: "mod-cta", text: t("save") });

    const doSave = () => {
      const text = ta.value.trim();
      const date = dateInput.value;
      if (!text) {
        new Notice(t("enterEntryText"));
        return;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        new Notice(t("invalidDate"));
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

/** Модалка импорта резервной копии: выбор JSON-файла + опции. */
export class ImportModal extends Modal {
  private filePath: string;
  private pickedContent: string | null = null;

  constructor(
    app: App,
    defaultPath: string,
    private applyMetaDefault: boolean,
    private onImport: (content: string, applyMeta: boolean) => Promise<ImportResult>,
  ) {
    super(app);
    this.filePath = defaultPath;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass("lc-modal");
    contentEl.createEl("h3", { text: t("importModalTitle") });

    const pathWrap = contentEl.createDiv({ cls: "lc-modal-field" });
    pathWrap.createEl("label", { text: t("importFileLabel") });
    const pathRow = pathWrap.createDiv({ cls: "lc-modal-path-row" });
    const pathInput = pathRow.createEl("input", {
      cls: "lc-modal-text",
      attr: { type: "text", placeholder: this.filePath || "backup.json" },
    });
    pathInput.value = this.filePath;
    pathInput.addEventListener("input", () => {
      this.filePath = pathInput.value.trim();
      this.pickedContent = null;
      pathInput.disabled = false;
    });

    const fileInput = pathRow.createEl("input", {
      attr: { type: "file", accept: ".json,application/json" },
    });
    fileInput.style.display = "none";

    const browse = pathRow.createEl("button", { cls: "lc-modal-cancel", text: t("importBrowse") });
    browse.type = "button";
    browse.addEventListener("click", () => {
      fileInput.value = "";
      fileInput.click();
    });
    fileInput.addEventListener("change", () => {
      const f = fileInput.files && fileInput.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        this.pickedContent = String(reader.result || "");
        this.filePath = "";
        pathInput.value = f.name;
        pathInput.disabled = true;
        pathInput.title = this.pickedContent.length + " chars";
      };
      reader.onerror = () => {
        new Notice(t("importError", { error: "FileReader" }));
      };
      reader.readAsText(f);
    });

    const metaWrap = contentEl.createDiv({ cls: "lc-modal-field" });
    const metaLabel = metaWrap.createEl("label", { text: t("importApplyMeta") });
    const metaBox = metaWrap.createEl("input", { type: "checkbox" });
    metaLabel.prepend(metaBox);
    metaBox.checked = this.applyMetaDefault;

    const row = contentEl.createDiv({ cls: "lc-modal-row" });
    row.createEl("button", { cls: "lc-modal-cancel", text: t("cancel") }).addEventListener("click", () => this.close());
    const runBtn = row.createEl("button", { cls: "mod-cta", text: t("importBtn") });

    const doImport = async () => {
      let content: string;
      if (this.pickedContent !== null) {
        content = this.pickedContent;
      } else {
        const path = this.filePath;
        if (!path) {
          new Notice(t("importFileNotFound"));
          return;
        }
        const file = this.app.vault.getAbstractFileByPath(path) as TFile | null;
        if (!(file instanceof TFile)) {
          new Notice(t("importFileNotFound"));
          return;
        }
        content = await this.app.vault.read(file);
      }
      runBtn.disabled = true;
      browse.disabled = true;
      try {
        const result = await this.onImport(content, metaBox.checked);
        if (result.entriesAdded + result.eventsAdded + result.zonesAdded === 0) {
          new Notice(t("importEmpty"), 6000);
        } else {
          new Notice(
            t("importSummary", {
              entries: result.entriesAdded,
              events: result.eventsAdded,
              zones: result.zonesAdded,
              skipped: result.entriesSkipped + result.eventsSkipped + result.zonesSkipped,
            }),
            6000,
          );
        }
        this.close();
      } catch (err: unknown) {
        if (err instanceof InvalidBackupError) {
          new Notice(t("importInvalidBackup"));
        } else {
          console.error("Life Calendar: import", err);
          new Notice(t("importError", { error: err instanceof Error ? err.message : String(err) }));
        }
        runBtn.disabled = false;
        browse.disabled = false;
      }
    };
    runBtn.addEventListener("click", () => void doImport());
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
