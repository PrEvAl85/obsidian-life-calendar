import { App, Modal, Notice, TFile, FuzzySuggestModal, MarkdownRenderer, Component } from "obsidian";
import { addDays, formatKey, todayKey } from "./date";
import {
  HEART_COLORS, JournalEntry, LifeEvent, LifeZone, ZONE_COLORS,
  BookDefinition, BookEntry, BookType, BOOK_TYPE_OPTIONS
} from "./types";
import { keyToDmy, weekdayName } from "./util";
import { t, monthNameGen } from "./i18n";
import { ImportResult, InvalidBackupError } from "./import";
import { AddExerciseRecordModal } from "./AddExerciseRecordModal";

export { AddExerciseRecordModal };

/** Извлекает имена файлов из синтаксиса ![[filename]] в тексте. */
function extractImageRefs(text: string): string[] {
  const matches = text.match(/!\[\[([^\]]+)\]\]/g);
  if (!matches) return [];
  return matches.map((m) => m.slice(3, -2));
}

/** Находит TFile по пути или имени (basename) среди файлов-изображений в хранилище. */
function findImageFile(app: App, nameOrPath: string): TFile | null {
  const files = app.vault.getFiles().filter((f) => {
    const ext = f.extension.toLowerCase();
    return ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"].includes(ext);
  });
  // Сначала ищем по полному пути
  let file = files.find((f) => f.path === nameOrPath);
  if (file) return file;
  // Затем по basename (для обратной совместимости)
  return files.find((f) => f.basename === nameOrPath) || null;
}

/** Кастомный suggest для [[wiki-links]] и ![[images]] в textarea модалок. */
class WikiLinkSuggest {
  private app: App;
  private textarea: HTMLTextAreaElement;
  private container: HTMLElement;
  private suggestEl: HTMLElement | null = null;
  private items: { title: string; path: string; isImage: boolean }[] = [];
  private selectedIndex = -1;
  private trigger: "link" | "image" | null = null;
  private triggerStart = -1;
  private isOpen = false;
  private scrollHandler: (e: Event) => void;
  private resizeHandler: (e: UIEvent) => void;

  constructor(app: App, textarea: HTMLTextAreaElement, container: HTMLElement) {
    this.app = app;
    this.textarea = textarea;
    this.container = container;
    this.scrollHandler = () => this.positionSuggest();
    this.resizeHandler = () => this.positionSuggest();
    this.bindEvents();
  }

  private bindEvents(): void {
    this.textarea.addEventListener("input", () => this.onInput());
    this.textarea.addEventListener("keydown", (e) => this.onKeydown(e));
    this.textarea.addEventListener("focus", () => this.onInput());
    this.textarea.addEventListener("blur", () => window.setTimeout(() => this.close(), 150));
    document.addEventListener("click", (e: MouseEvent) => {
      if (this.suggestEl && !this.suggestEl.contains(e.target as Node) && e.target !== this.textarea) {
        this.close();
      }
    });
  }

  private onInput(): void {
    const cursorPos = this.textarea.selectionStart;
    const text = this.textarea.value;
    // Ищем триггер [[ или ![[ перед курсором
    const beforeCursor = text.slice(0, cursorPos);
    const linkMatch = beforeCursor.match(/(\[\[)([^\]]*)$/);
    const imageMatch = beforeCursor.match(/(!\[\[)([^\]]*)$/);

    if (linkMatch) {
      this.trigger = "link";
      this.triggerStart = cursorPos - linkMatch[0].length;
      void this.query(linkMatch[2]);
    } else if (imageMatch) {
      this.trigger = "image";
      this.triggerStart = cursorPos - imageMatch[0].length;
      void this.query(imageMatch[2]);
    } else {
      this.close();
    }
  }

  private async query(filter: string): Promise<void> {
    const files = this.app.vault.getMarkdownFiles();
    const lowerFilter = filter.toLowerCase();
    this.items = files
      .map((f) => ({ title: f.basename, path: f.path, isImage: false }))
      .filter((item) => item.title.toLowerCase().includes(lowerFilter))
      .slice(0, 20);

    if (this.trigger === "image") {
      const imageFiles = this.app.vault.getFiles().filter((f) => {
        const ext = f.extension.toLowerCase();
        return ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"].includes(ext);
      });
      this.items = imageFiles
        .map((f) => ({ title: f.basename, path: f.path, isImage: true }))
        .filter((item) => item.title.toLowerCase().includes(lowerFilter))
        .slice(0, 20);
    }

    if (this.items.length > 0) {
      this.open();
    } else {
      this.close();
    }
  }

  private open(): void {
    if (this.isOpen) {
      this.render();
      return;
    }
    this.isOpen = true;
    this.selectedIndex = -1;

    this.suggestEl = this.container.createDiv({ cls: "lc-suggest" });
    this.positionSuggest();
    this.render();

    // Обновляем позицию при скролле/ресайзе
    window.addEventListener("scroll", this.scrollHandler, true);
    window.addEventListener("resize", this.resizeHandler, true);
  }

  private positionSuggest(): void {
    if (!this.suggestEl) return;
    const rect = this.textarea.getBoundingClientRect();
    const containerRect = this.container.getBoundingClientRect();
    this.suggestEl.style.top = `${rect.bottom - containerRect.top + 2}px`;
    this.suggestEl.style.left = `${rect.left - containerRect.left}px`;
    this.suggestEl.style.width = `${rect.width}px`;
  }

  private render(): void {
    if (!this.suggestEl) return;
    this.suggestEl.empty();
    for (let i = 0; i < this.items.length; i++) {
      const item = this.items[i];
      const el = this.suggestEl.createDiv({ cls: "lc-suggest-item" });
      el.setAttribute("data-index", i.toString());
      if (i === this.selectedIndex) el.addClass("is-selected");
      const prefix = this.trigger === "image" ? "![[" : "[[";
      const suffix = "]]";
      el.createSpan({ text: prefix + item.title + suffix });
      el.addEventListener("click", () => this.select(i));
      el.addEventListener("mouseenter", () => this.setSelected(i));
    }
  }

  private setSelected(index: number): void {
    this.selectedIndex = index;
    this.render();
  }

  private select(index: number): void {
    const item = this.items[index];
    if (!item) return;
    const prefix = this.trigger === "image" ? "![[" : "[[";
    const suffix = "]]";
    const insertText = prefix + item.title + suffix;

    const start = this.triggerStart;
    const end = this.textarea.selectionStart;
    const before = this.textarea.value.slice(0, start);
    const after = this.textarea.value.slice(end);
    this.textarea.value = before + insertText + after;
    this.textarea.selectionStart = this.textarea.selectionEnd = start + insertText.length;
    this.textarea.focus();
    this.close();
    // Триггерим input для реактивности
    this.textarea.dispatchEvent(new Event("input", { bubbles: true }));
  }

  private onKeydown(e: KeyboardEvent): void {
    if (!this.isOpen || this.items.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      this.setSelected(Math.min(this.selectedIndex + 1, this.items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      this.setSelected(Math.max(this.selectedIndex - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (this.selectedIndex >= 0) this.select(this.selectedIndex);
    } else if (e.key === "Escape") {
      e.preventDefault();
      this.close();
    }
  }

  private close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    if (this.suggestEl) {
      this.suggestEl.remove();
      this.suggestEl = null;
    }
    window.removeEventListener("scroll", this.scrollHandler, true);
    window.removeEventListener("resize", this.resizeHandler, true);
  }
}

/** Модалка выбора изображения: из хранилища или с компьютера. */
export class ImageSelectModal extends Modal {
  private activeTab: "vault" | "computer" = "vault";
  private onSelect: (embedSyntax: string) => void;
  private attachmentsFolder: string;

  constructor(
    app: App,
    onSelect: (embedSyntax: string) => void,
    journalFolder: string,
  ) {
    super(app);
    this.onSelect = onSelect;
    this.attachmentsFolder = `${journalFolder}/Attachments`;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass("lc-modal");
    contentEl.createEl("h3", { text: t("imageSelectTitle") });

    // Tab buttons
    const tabBar = contentEl.createDiv({ cls: "lc-image-tabs" });
    const vaultTab = tabBar.createEl("button", {
      type: "button",
      cls: "lc-image-tab active",
      text: t("imageFromVault"),
    });
    const computerTab = tabBar.createEl("button", {
      type: "button",
      cls: "lc-image-tab",
      text: t("imageFromComputer"),
    });

    const tabContent = contentEl.createDiv({ cls: "lc-image-tab-content" });

    const switchTab = (tab: "vault" | "computer") => {
      this.activeTab = tab;
      vaultTab.toggleClass("active", tab === "vault");
      computerTab.toggleClass("active", tab === "computer");
      tabContent.empty();
      if (tab === "vault") this.renderVaultTab(tabContent);
      else this.renderComputerTab(tabContent);
    };

    vaultTab.addEventListener("click", () => switchTab("vault"));
    computerTab.addEventListener("click", () => switchTab("computer"));

    // Initial render
    this.renderVaultTab(tabContent);
  }

  private renderVaultTab(container: HTMLElement): void {
    const onSelect = (embedSyntax: string) => this.onSelect(embedSyntax);
    const closeModal = () => this.close();
    new (class extends FuzzySuggestModal<TFile> {
      constructor(app: App) { super(app); }
      getItems(): TFile[] {
        return this.app.vault.getFiles().filter((f) => {
          const ext = f.extension.toLowerCase();
          return ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"].includes(ext);
        });
      }
      getItemText(file: TFile): string { return file.path; }
      onChooseItem(file: TFile): void {
        this.close();
        onSelect(`![[${file.path}]]`);
        closeModal();
      }
    })(this.app).open();
  }

  private renderComputerTab(container: HTMLElement): void {
    const dropZone = container.createDiv({ cls: "lc-image-dropzone" });
    dropZone.createSpan({ text: t("imageDropZone") });

    const fileInput = dropZone.createEl("input", {
      type: "file",
      attr: { accept: "image/png,image/jpeg,image/gif,image/webp,image/svg+xml,image/bmp" },
      cls: "lc-hidden",
    });

    dropZone.addEventListener("click", () => fileInput.click());
    dropZone.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropZone.addClass("dragover");
    });
    dropZone.addEventListener("dragleave", () => dropZone.removeClass("dragover"));
    dropZone.addEventListener("drop", (e) => {
      e.preventDefault();
      dropZone.removeClass("dragover");
      const file = e.dataTransfer?.files[0];
      if (file) void this.handleFile(file);
    });
    fileInput.addEventListener("change", () => {
      const file = fileInput.files?.[0];
      if (file) void this.handleFile(file);
      fileInput.value = "";
    });
  }

  private async handleFile(file: File): Promise<void> {
    if (!file.type.startsWith("image/")) {
      new Notice(t("imageImportError", { error: "Not an image file" }));
      return;
    }

    const notice = new Notice(t("imageImporting"), 0);

    try {
      // Убеждаемся, что папка существует
      const folder = this.app.vault.getAbstractFileByPath(this.attachmentsFolder);
      if (!folder) {
        await this.app.vault.createFolder(this.attachmentsFolder);
      }

      // Генерируем уникальное имя файла
      const timestamp = Date.now();
      const ext = file.name.split(".").pop() || "png";
      const fileName = `${file.name.replace(/\.[^/.]+$/, "")}_${timestamp}.${ext}`;
      const filePath = `${this.attachmentsFolder}/${fileName}`;

      // Читаем файл как ArrayBuffer и сохраняем в vault
      const arrayBuffer = await file.arrayBuffer();
      await this.app.vault.createBinary(filePath, new Uint8Array(arrayBuffer));

      // Вставляем embed с правильным путем
      this.onSelect(`![[${filePath}]]`);
      this.close();
      notice.hide();
    } catch (err: unknown) {
      notice.hide();
      new Notice(t("imageImportError", { error: err instanceof Error ? err.message : String(err) }));
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

/** Модалка добавления записи в дневник. */
export class AddEntryModal extends Modal {
  private dateValue: string;
  private saveHandler: (date: string, text: string) => Promise<void>;
  private journalFolder: string;

  constructor(
    app: App,
    defaultDate: string,
    saveHandler: (date: string, text: string) => Promise<void>,
    journalFolder: string = "Life Calendar/Journal",
  ) {
    super(app);
    this.dateValue = defaultDate;
    this.saveHandler = saveHandler;
    this.journalFolder = journalFolder;
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

    // Toolbar для вставки ссылок и изображений
    const toolbar = textWrap.createDiv({ cls: "lc-modal-toolbar" });
    const linkBtn = toolbar.createEl("button", { type: "button", cls: "lc-modal-toolbar-btn", text: "🔗 " + t("insertLink") });
    const imageBtn = toolbar.createEl("button", { type: "button", cls: "lc-modal-toolbar-btn", text: "🖼 " + t("insertImage") });

    const ta = textWrap.createEl("textarea", {
      cls: "lc-modal-textarea",
      attr: { rows: "6", placeholder: t("entryTextPlaceholder") },
    });

    // Контейнер для превью изображений
    const previewContainer = textWrap.createDiv({ cls: "lc-modal-preview" });

    // WikiLinkSuggest для автодополнения [[ и ![[
    new WikiLinkSuggest(this.app, ta, textWrap);

    // Обновление превью при вводе
    const updatePreview = () => {
      previewContainer.empty();
      const refs = extractImageRefs(ta.value);
      for (const ref of refs) {
        const file = findImageFile(this.app, ref);
        if (file) {
          const imgEl = previewContainer.createEl("img", { cls: "lc-modal-preview-img", attr: { src: this.app.vault.getResourcePath(file) } });
          imgEl.title = ref;
        }
      }
      previewContainer.toggleClass("has-content", refs.length > 0);
    };
    ta.addEventListener("input", updatePreview);

    // Обработчики кнопок тулбара
    const insertAtCursor = (text: string) => {
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      ta.value = ta.value.slice(0, start) + text + ta.value.slice(end);
      ta.selectionStart = ta.selectionEnd = start + text.length;
      ta.focus();
      ta.dispatchEvent(new Event("input", { bubbles: true }));
    };

    linkBtn.addEventListener("click", () => {
      new (class extends FuzzySuggestModal<TFile> {
        constructor(app: App) { super(app); }
        getItems(): TFile[] { return this.app.vault.getMarkdownFiles(); }
        getItemText(file: TFile): string { return file.basename; }
        onChooseItem(file: TFile): void { insertAtCursor("[[" + file.basename + "]]"); }
      })(this.app).open();
    });

imageBtn.addEventListener("click", () => {
      new ImageSelectModal(this.app, (embedSyntax) => {
        insertAtCursor(embedSyntax);
      }, this.journalFolder).open();
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
  openDayNote: (path: string) => Promise<void>;
}

/** Окно недели: записи дневника и события недели, добавляемые/редактируемые независимо. */
export class WeekModal extends Modal {
  private entries: JournalEntry[] = [];
  private events: LifeEvent[] = [];
  private journalFolder: string;

  constructor(
    app: App,
    private weekKey: string,
    private load: () => Promise<{ entries: JournalEntry[]; events: LifeEvent[] }>,
    private handlers: WeekHandlers,
    journalFolder: string = "Life Calendar/Journal",
  ) {
    super(app);
    this.journalFolder = journalFolder;
  }

  async onOpen(): Promise<void> {
    const data = await this.load();
    this.entries = data.entries;
    this.events = data.events;
    await this.render();
  }

  private async reload(): Promise<void> {
    const data = await this.load();
    this.entries = data.entries;
    this.events = data.events;
    await this.render();
  }

  private async render(): Promise<void> {
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
          const m = new EntryEditModal(this.app, { date: e.date, text: e.text, rawText: e.rawText }, this.journalFolder);
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
      const openBtn = btns.createEl("button", { cls: "lc-week-btn", text: "📄" });
      openBtn.title = t("openDayNote");
      openBtn.addEventListener("click", () => {
        void (async () => {
          await this.handlers.openDayNote(e.path);
        })();
      });
      // Рендерим текст через MarkdownRenderer для поддержки [[wiki-links]] и ![[images]]
      const rendered = item.createDiv({ cls: "lc-week-item-rendered" });
      const renderComponent = new Component();
      renderComponent.load(); // Инициализируем компонент
      await MarkdownRenderer.render(this.app, e.rawText || e.text, rendered, e.path, renderComponent);
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

    const row = contentEl.createDiv({ cls: "lc-modal-row" });
    row.createEl("button", { cls: "lc-modal-cancel", text: t("close") }).addEventListener("click", () => this.close());
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

/** Интерфейс для обработчиков операций в Feed. */
export interface FeedHandlers {
  updateEntry: (oldDate: string, index: number, newDate: string, text: string) => Promise<void>;
  deleteEntry: (date: string, index: number) => Promise<void>;
  moveEntry: (date: string, index: number, dir: -1 | 1) => Promise<void>;
  openDayNote: (path: string) => Promise<void>;
}

/** Модалка «Поток» (Feed): хронологический список всех записей с группировкой, фильтрацией и CRUD. */
export class FeedModal extends Modal {
  private allEntries: JournalEntry[] = [];
  private filteredEntries: JournalEntry[] = [];
  private searchQuery = "";
  private dateFrom = "";
  private dateTo = "";
  private hasImagesOnly = false;
  private sortDescending = true; // true = новые сверху (desc), false = старые сверху (asc)
  private journalFolder: string;
  private handlers: FeedHandlers;
  private listContainer: HTMLElement | null = null;
  private debounceTimer: number | null = null;

  constructor(
    app: App,
    private loadEntries: () => Promise<JournalEntry[]>,
    handlers: FeedHandlers,
    journalFolder: string = "Life Calendar/Journal",
  ) {
    super(app);
    this.handlers = handlers;
    this.journalFolder = journalFolder;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("lc-modal", "lc-feed-modal");

    // Заголовок
    contentEl.createEl("h3", { text: t("feedTitle") });

    // Панель фильтров
    this.renderFilterBar(contentEl);

    // Контейнер списка
    this.listContainer = contentEl.createDiv({ cls: "lc-feed-list" });

    // Загружаем записи
    void (async () => {
      await this.loadAndRender();
    })();
  }

  private renderFilterBar(container: HTMLElement): void {
    const filterBar = container.createDiv({ cls: "lc-feed-filter-bar" });

    // Поиск
    const searchWrap = filterBar.createDiv({ cls: "lc-feed-filter-item" });
    searchWrap.createEl("label", { text: t("feedSearchPlaceholder"), cls: "lc-feed-filter-label" });
    const searchInput = searchWrap.createEl("input", {
      type: "text",
      cls: "lc-feed-search-input",
      attr: { placeholder: t("feedSearchPlaceholder") },
    });
    searchInput.addEventListener("input", () => {
      this.searchQuery = searchInput.value.trim().toLowerCase();
      this.debouncedRender();
    });

    // Дата «С»
    const fromWrap = filterBar.createDiv({ cls: "lc-feed-filter-item" });
    fromWrap.createEl("label", { text: t("feedFilterDateFrom"), cls: "lc-feed-filter-label" });
    const fromInput = fromWrap.createEl("input", { type: "date", cls: "lc-feed-date-input" });
    fromInput.addEventListener("change", () => {
      this.dateFrom = fromInput.value;
      this.debouncedRender();
    });

    // Дата «По»
    const toWrap = filterBar.createDiv({ cls: "lc-feed-filter-item" });
    toWrap.createEl("label", { text: t("feedFilterDateTo"), cls: "lc-feed-filter-label" });
    const toInput = toWrap.createEl("input", { type: "date", cls: "lc-feed-date-input" });
    toInput.addEventListener("change", () => {
      this.dateTo = toInput.value;
      this.debouncedRender();
    });

    // Чекбокс «Только с изображениями»
    const imagesWrap = filterBar.createDiv({ cls: "lc-feed-filter-item lc-feed-filter-checkbox" });
    const imagesCheckbox = imagesWrap.createEl("input", { type: "checkbox", cls: "lc-feed-checkbox" });
    imagesCheckbox.addEventListener("change", () => {
      this.hasImagesOnly = imagesCheckbox.checked;
      this.debouncedRender();
    });
    imagesWrap.createEl("label", { text: t("feedFilterHasImages"), cls: "lc-feed-filter-label" });

    // Переключатель сортировки
    const sortWrap = filterBar.createDiv({ cls: "lc-feed-filter-item lc-feed-filter-sort" });
    sortWrap.createEl("label", { text: this.sortDescending ? t("feedSortNewest") : t("feedSortOldest"), cls: "lc-feed-filter-label" });
    const sortBtn = sortWrap.createEl("button", {
      type: "button",
      cls: "lc-feed-sort-btn",
      text: this.sortDescending ? "⬇" : "⬆",
    });
    sortBtn.title = this.sortDescending ? t("feedSortOldest") : t("feedSortNewest");
    sortBtn.addEventListener("click", () => {
      this.sortDescending = !this.sortDescending;
      sortBtn.textContent = this.sortDescending ? "⬇" : "⬆";
      sortBtn.title = this.sortDescending ? t("feedSortOldest") : t("feedSortNewest");
      sortWrap.querySelector("label")!.textContent = this.sortDescending ? t("feedSortNewest") : t("feedSortOldest");
      this.debouncedRender();
    });
  }

  private debouncedRender(): void {
    if (this.debounceTimer !== null) window.clearTimeout(this.debounceTimer);
    this.debounceTimer = window.setTimeout(() => {
      this.debounceTimer = null;
      this.applyFiltersAndRender();
    }, 150);
  }

  private async loadAndRender(): Promise<void> {
    this.allEntries = await this.loadEntries();
    this.applyFiltersAndRender();
  }

  private applyFiltersAndRender(): void {
    // Фильтрация
    this.filteredEntries = this.allEntries.filter((entry) => {
      // Текстовый поиск
      if (this.searchQuery) {
        const text = (entry.rawText || entry.text).toLowerCase();
        if (!text.includes(this.searchQuery)) return false;
      }
      // Диапазон дат
      if (this.dateFrom && entry.date < this.dateFrom) return false;
      if (this.dateTo && entry.date > this.dateTo) return false;
      // Только с изображениями
      if (this.hasImagesOnly) {
        const hasImage = /!\[\[[^\]]+\]\]/.test(entry.rawText || entry.text);
        if (!hasImage) return false;
      }
      return true;
    });

    // Сортировка
    this.filteredEntries.sort((a, b) => {
      const cmp = a.date.localeCompare(b.date);
      if (cmp !== 0) return this.sortDescending ? -cmp : cmp;
      // При одинаковой дате — по индексу
      return this.sortDescending ? b.index - a.index : a.index - b.index;
    });

    this.renderList();
  }

  private renderList(): void {
    if (!this.listContainer) return;
    const container = this.listContainer;
    container.empty();

    if (this.filteredEntries.length === 0) {
      container.createDiv({ cls: "lc-feed-empty", text: t("feedNoEntries") });
      return;
    }

    // Группировка: Год → Месяц → День
    const groups = new Map<string, Map<string, JournalEntry[]>>(); // year -> month -> entries[]

    for (const entry of this.filteredEntries) {
      const year = entry.date.slice(0, 4);
      const month = entry.date.slice(5, 7); // "MM"
      if (!groups.has(year)) groups.set(year, new Map());
      const yearMap = groups.get(year)!;
      if (!yearMap.has(month)) yearMap.set(month, []);
      yearMap.get(month)!.push(entry);
    }

    // Рендерим дерево
    for (const [year, yearMap] of groups) {
      const yearEl = container.createDiv({ cls: "lc-feed-group lc-feed-year" });
      yearEl.createDiv({ cls: "lc-feed-group-header", text: `${t("feedGroupYear")} ${year}` });

      // Месяцы в году: сортируем по убыванию (новые месяцы сверху) или возрастанию
      const sortedMonths = Array.from(yearMap.keys()).sort((a, b) =>
        this.sortDescending ? b.localeCompare(a) : a.localeCompare(b)
      );

      for (const month of sortedMonths) {
        const monthEntries = yearMap.get(month)!;
        const monthEl = yearEl.createDiv({ cls: "lc-feed-group lc-feed-month" });
        const monthName = this.getMonthName(+month);
        monthEl.createDiv({ cls: "lc-feed-group-header", text: `${t("feedGroupMonth")} ${monthName}` });

        // Группируем по дням внутри месяца
        const dayGroups = new Map<string, JournalEntry[]>();
        for (const entry of monthEntries) {
          const day = entry.date.slice(8, 10); // "DD"
          if (!dayGroups.has(day)) dayGroups.set(day, []);
          dayGroups.get(day)!.push(entry);
        }

        // Дни в месяце: сортируем
        const sortedDays = Array.from(dayGroups.keys()).sort((a, b) =>
          this.sortDescending ? b.localeCompare(a) : a.localeCompare(b)
        );

        for (const day of sortedDays) {
          const dayEntries = dayGroups.get(day)!;
          const dateKey = `${year}-${month}-${day}`;
          const dayEl = monthEl.createDiv({ cls: "lc-feed-group lc-feed-day" });
          const weekday = weekdayName(dateKey);
          dayEl.createDiv({
            cls: "lc-feed-group-header lc-feed-day-header",
            text: t("feedEntryDateFormat", { date: day + "." + month + "." + year, weekday }),
          });

          // Карточки записей дня
          const entriesEl = dayEl.createDiv({ cls: "lc-feed-entries" });
          for (const entry of dayEntries) {
            this.renderEntryCard(entriesEl, entry);
          }
        }
      }
    }
  }

  private getMonthName(monthIndex: number): string {
    // monthIndex: 1-12
    return monthNameGen(monthIndex - 1);
  }

  private renderEntryCard(container: HTMLElement, entry: JournalEntry): void {
    const card = container.createDiv({ cls: "lc-feed-entry-card", attr: { "data-date": entry.date, "data-index": String(entry.index) } });

    // Заголовок карточки с действиями
    const header = card.createDiv({ cls: "lc-feed-entry-header" });
    const actions = header.createDiv({ cls: "lc-feed-entry-actions" });

    // Кнопка вверх
    if (entry.index > 0) {
      const upBtn = actions.createEl("button", { cls: "lc-feed-action-btn", text: "▲", attr: { title: t("feedMoveUpTooltip") } });
      upBtn.addEventListener("click", () => {
        void (async () => {
          await this.handlers.moveEntry(entry.date, entry.index, -1);
          await this.refresh();
        })();
      });
    }

    // Кнопка вниз
    if (entry.index < entry.blocks - 1) {
      const downBtn = actions.createEl("button", { cls: "lc-feed-action-btn", text: "▼", attr: { title: t("feedMoveDownTooltip") } });
      downBtn.addEventListener("click", () => {
        void (async () => {
          await this.handlers.moveEntry(entry.date, entry.index, 1);
          await this.refresh();
        })();
      });
    }

    // Кнопка редактирования
    const editBtn = actions.createEl("button", { cls: "lc-feed-action-btn", text: "✏️", attr: { title: t("feedEditTooltip") } });
    editBtn.addEventListener("click", () => {
      void (async () => {
        const modal = new EntryEditModal(this.app, {
          date: entry.date,
          text: entry.text,
          rawText: entry.rawText,
          path: entry.path,
          index: entry.index,
          blocks: entry.blocks,
        }, this.journalFolder);
        modal.open();
        const res = await modal.awaitResult();
        if (res) {
          await this.handlers.updateEntry(entry.date, entry.index, res.date, res.text);
          await this.refresh();
        }
      })();
    });

    // Кнопка удаления
    const delBtn = actions.createEl("button", { cls: "lc-feed-action-btn", text: "🗑", attr: { title: t("feedDeleteTooltip") } });
    delBtn.addEventListener("click", () => {
      void this.confirmDelete(() => {
        void (async () => {
          await this.handlers.deleteEntry(entry.date, entry.index);
          await this.refresh();
        })();
      });
    });

    // Кнопка «Открыть заметку»
    const openBtn = actions.createEl("button", { cls: "lc-feed-action-btn", text: "📄", attr: { title: t("openDayNote") } });
    openBtn.addEventListener("click", () => {
      void this.handlers.openDayNote(entry.path);
    });

    // Текст записи (рендерим через MarkdownRenderer для поддержки вики-ссылок и изображений)
    const rendered = card.createDiv({ cls: "lc-feed-entry-content" });
    const renderComponent = new Component();
    renderComponent.load();
    void MarkdownRenderer.render(this.app, entry.rawText || entry.text, rendered, entry.path, renderComponent);
  }

  private confirmDelete(onConfirm: () => void): void {
    const modal = new (class extends Modal {
      onOpen(): void {
        this.contentEl.addClass("lc-modal");
        this.contentEl.createEl("p", { text: t("feedConfirmDelete") });
        const row = this.contentEl.createDiv({ cls: "lc-modal-row" });
        row.createEl("button", { cls: "lc-modal-cancel", text: t("cancel") }).addEventListener("click", () => this.close());
        row.createEl("button", { cls: "mod-cta mod-warning", text: t("delete") }).addEventListener("click", () => {
          this.close();
          onConfirm();
        });
      }
    })(this.app);
    modal.open();
  }

  private async refresh(): Promise<void> {
    this.allEntries = await this.loadEntries();
    this.applyFiltersAndRender();
  }

  onClose(): void {
    if (this.debounceTimer !== null) window.clearTimeout(this.debounceTimer);
    this.contentEl.empty();
  }
}

/** Модалка редактирования записи дневника (дата + текст). */
export class EntryEditModal extends Modal {
  private result: { date: string; text: string } | null = null;
  private resolveFn: ((v: { date: string; text: string } | null) => void) | null = null;
  private promise: Promise<{ date: string; text: string } | null>;
  private journalFolder: string;

   constructor(
    app: App,
    private initial: { date: string; text: string; rawText?: string; path?: string; index?: number; blocks?: number },
    journalFolder: string = "Life Calendar/Journal",
  ) {
    super(app);
    this.journalFolder = journalFolder;
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

    // Toolbar для вставки ссылок и изображений
    const toolbar = textWrap.createDiv({ cls: "lc-modal-toolbar" });
    const linkBtn = toolbar.createEl("button", { type: "button", cls: "lc-modal-toolbar-btn", text: "🔗 " + t("insertLink") });
    const imageBtn = toolbar.createEl("button", { type: "button", cls: "lc-modal-toolbar-btn", text: "🖼 " + t("insertImage") });

    const ta = textWrap.createEl("textarea", {
      cls: "lc-modal-textarea",
      attr: { rows: "6", placeholder: t("entryTextPlaceholder") },
    });
    ta.value = this.initial.rawText ?? this.initial.text;

    // Контейнер для превью изображений
    const previewContainer = textWrap.createDiv({ cls: "lc-modal-preview" });

    // WikiLinkSuggest для автодополнения [[ и ![[
    new WikiLinkSuggest(this.app, ta, textWrap);

    // Обновление превью при вводе
    const updatePreview = () => {
      previewContainer.empty();
      const refs = extractImageRefs(ta.value);
      for (const ref of refs) {
        const file = findImageFile(this.app, ref);
        if (file) {
          const imgEl = previewContainer.createEl("img", { cls: "lc-modal-preview-img", attr: { src: this.app.vault.getResourcePath(file) } });
          imgEl.title = ref;
        }
      }
      previewContainer.toggleClass("has-content", refs.length > 0);
    };
    ta.addEventListener("input", updatePreview);
    // Инициализация превью для начального текста
    updatePreview();

    // Обработчики кнопок тулбара
    const insertAtCursor = (text: string) => {
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      ta.value = ta.value.slice(0, start) + text + ta.value.slice(end);
      ta.selectionStart = ta.selectionEnd = start + text.length;
      ta.focus();
      ta.dispatchEvent(new Event("input", { bubbles: true }));
    };

    linkBtn.addEventListener("click", () => {
      new (class extends FuzzySuggestModal<TFile> {
        constructor(app: App) { super(app); }
        getItems(): TFile[] { return this.app.vault.getMarkdownFiles(); }
        getItemText(file: TFile): string { return file.basename; }
        onChooseItem(file: TFile): void { insertAtCursor("[[" + file.basename + "]]"); }
      })(this.app).open();
    });

imageBtn.addEventListener("click", () => {
      new ImageSelectModal(this.app, (embedSyntax) => {
        insertAtCursor(embedSyntax);
      }, this.journalFolder).open();
    });

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
      cls: "lc-hidden",
      attr: { type: "file", accept: ".json,application/json" },
    });

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
        this.pickedContent = typeof reader.result === "string" ? reader.result : "";
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

/** Модалка добавления/редактирования записи о книге. */
export class AddBookRecordModal extends Modal {
  private result: BookEntry | null = null;
  private resolveFn: ((v: BookEntry | null) => void) | null = null;
  private promise: Promise<BookEntry | null>;

  constructor(
    app: App,
    private plugin: {
      bookTrackerStore: { getBooks: () => BookDefinition[]; getBookById: (id: string) => BookDefinition | undefined; getBookByName: (name: string) => BookDefinition | undefined; getJournalBooks: () => Promise<{ bookId: string; name: string; author?: string; bookType?: BookType; dateStarted?: string }[]> };
    },
    private onSave: (entry: BookEntry) => Promise<void>,
    private existingEntry: BookEntry | null = null,
    private prefill?: { name?: string; author?: string; bookType?: BookType; dateStarted?: string; bookId?: string },
    private options?: { isBookStart?: boolean; onDeleteBook?: (bookName: string) => Promise<void> },
  ) {
    super(app);
    this.promise = new Promise((resolve) => {
      this.resolveFn = resolve;
    });
  }

  awaitResult(): Promise<BookEntry | null> {
    return this.promise;
  }

  private finish(v: BookEntry | null): void {
    this.result = v;
    this.close();
  }

  async onOpen(): Promise<void> {
    const { contentEl } = this;
    contentEl.addClass("lc-modal");
    const isEdit = !!this.existingEntry;
    contentEl.createEl("h3", { text: isEdit ? t("editBookRecord") : t("addBookRecord") });

    const books = this.plugin.bookTrackerStore.getBooks();
    const today = new Date().toISOString().split("T")[0];
    const entry = this.existingEntry;

    const journalBooks = await this.plugin.bookTrackerStore.getJournalBooks();
    const knownBooks = new Map<string, { name: string; author?: string; bookType?: BookType; dateStarted?: string }>();
    for (const book of books) {
      knownBooks.set(book.name.toLowerCase(), {
        name: book.name,
        author: book.author,
        bookType: book.bookType,
      });
    }
    for (const jb of journalBooks) {
      const key = jb.name.toLowerCase();
      const existing = knownBooks.get(key);
      if (!existing) {
        knownBooks.set(key, {
          name: jb.name,
          author: jb.author,
          bookType: jb.bookType,
          dateStarted: jb.dateStarted,
        });
      } else {
        if (!existing.author && jb.author) existing.author = jb.author;
        if (!existing.bookType && jb.bookType) existing.bookType = jb.bookType;
        if (!existing.dateStarted && jb.dateStarted) existing.dateStarted = jb.dateStarted;
      }
    }

    const bookWrap = contentEl.createDiv({ cls: "lc-modal-field" });
    bookWrap.createEl("label", { text: t("bookTitle") });
    const bookInput = bookWrap.createEl("input", {
      cls: "lc-modal-text",
      attr: { placeholder: t("selectBookOrType"), list: "book-options" },
    });
    bookInput.value = entry?.name || this.prefill?.name || "";
    const datalist = bookWrap.createEl("datalist", { attr: { id: "book-options" } });
    const bookNames = new Set<string>();
    for (const book of books) {
      bookNames.add(book.name.toLowerCase());
      datalist.createEl("option", { value: book.name });
    }
    for (const jb of journalBooks) {
      if (bookNames.has(jb.name.toLowerCase())) continue;
      bookNames.add(jb.name.toLowerCase());
      datalist.createEl("option", { value: jb.name });
    }

    const authorWrap = contentEl.createDiv({ cls: "lc-modal-field" });
    authorWrap.createEl("label", { text: t("author") });
    const authorInput = authorWrap.createEl("input", {
      cls: "lc-modal-text",
      attr: { placeholder: t("enterAuthor") },
    });
    authorInput.value = entry?.author || this.prefill?.author || "";

    const typeWrap = contentEl.createDiv({ cls: "lc-modal-field" });
    typeWrap.createEl("label", { text: t("bookType") });
    const typeSelect = typeWrap.createEl("select", { cls: "lc-modal-text" });
    for (const opt of BOOK_TYPE_OPTIONS) {
      const option = typeSelect.createEl("option", { text: opt.label });
      option.value = opt.value;
    }
    typeSelect.value = entry?.bookType || this.prefill?.bookType || "electronic";

    const dateStartWrap = contentEl.createDiv({ cls: "lc-modal-field" });
    dateStartWrap.createEl("label", { text: t("dateStarted") });
    const dateStartInput = dateStartWrap.createEl("input", { type: "date" });
    dateStartInput.value = entry?.date || entry?.dateStarted || this.prefill?.dateStarted || today;

    const valueWrap = contentEl.createDiv({ cls: "lc-modal-field" });
    valueWrap.createEl("label", { text: t("bookPages") });
    const valueInput = valueWrap.createEl("input", {
      cls: "lc-modal-text",
      attr: { placeholder: t("enterBookTitle"), type: "number", step: "1", min: "0" },
    });
    valueInput.value = entry?.value?.toString() || "";

    const ratingWrap = contentEl.createDiv({ cls: "lc-modal-field" });
    ratingWrap.createEl("label", { text: t("rating") });
    const ratingInput = ratingWrap.createEl("input", {
      cls: "lc-modal-text",
      attr: { type: "number", min: "1", max: "5", step: "0.5" },
    });
    ratingInput.value = entry?.rating?.toString() || "";

    const dateReadWrap = contentEl.createDiv({ cls: "lc-modal-field" });
    dateReadWrap.createEl("label", { text: t("dateCurrentRead") });
    const dateReadInput = dateReadWrap.createEl("input", { type: "date" });
    dateReadInput.value = today;
    dateReadWrap.hide();

    const dateEndWrap = contentEl.createDiv({ cls: "lc-modal-field" });
    dateEndWrap.createEl("label", { text: t("dateFinished") });
    const dateEndInput = dateEndWrap.createEl("input", { type: "date" });
    dateEndInput.value = entry?.dateFinished || "";

    // When the book name matches an already-known book, lock metadata fields
    const applyLock = () => {
      // For the book's start record, allow editing all book data
      if (this.options?.isBookStart) {
        authorInput.disabled = false;
        typeSelect.disabled = false;
        dateStartInput.disabled = false;
        return;
      }
      const name = bookInput.value.trim().toLowerCase();
      const known = knownBooks.get(name);
      if (known) {
        if (!entry) {
          authorInput.value = known.author || "";
          typeSelect.value = known.bookType || "electronic";
          dateStartInput.value = known.dateStarted || today;
          dateReadWrap.show();
        }
        authorInput.disabled = true;
        typeSelect.disabled = true;
        dateStartInput.disabled = true;
      } else {
        if (!entry) {
          authorInput.disabled = false;
          typeSelect.disabled = false;
          dateStartInput.disabled = false;
          dateReadWrap.hide();
        }
      }
    };
    bookInput.addEventListener("input", applyLock);
    bookInput.addEventListener("change", applyLock);
    applyLock();

    const row = contentEl.createDiv({ cls: "lc-modal-row" });

    if (this.options?.isBookStart) {
      const deleteBookBtn = row.createEl("button", { cls: "lc-modal-delete", text: t("deleteBook") });
      deleteBookBtn.type = "button";
      deleteBookBtn.addEventListener("click", () => {
        const bookName = bookInput.value.trim() || entry?.name || "";
        this.confirmDeleteBook(bookName);
      });
    }

    const cancelBtn = row.createEl("button", { cls: "lc-modal-cancel", text: t("cancel") });
    const saveBtn = row.createEl("button", { cls: "mod-cta", text: t("save") });

    cancelBtn.addEventListener("click", () => this.finish(null));

    saveBtn.addEventListener("click", () => {
      void (async () => {
      const name = bookInput.value.trim();
      const author = authorInput.value.trim() || undefined;
      const bookType = typeSelect.value as BookType;
      const value = valueInput.valueAsNumber || undefined;
      const rating = ratingInput.valueAsNumber || undefined;
      const dateStarted = dateStartInput.value || today;
      const dateFinished = dateEndInput.value || undefined;

      if (!name) {
        new Notice(t("enterBookTitle"));
        return;
      }

      const bookDef = this.plugin.bookTrackerStore.getBookByName(name) ||
                      books.find(b => b.name.toLowerCase() === name.toLowerCase());
      const bookId = this.prefill?.bookId || (bookDef ? bookDef.id : (entry?.bookId || `book_${name.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`));

      const result: BookEntry = {
        id: entry?.id || `entry_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        bookId,
        name,
        author,
        unit: 'pages',
        date: dateReadWrap.isShown() ? (dateReadInput.value || dateStarted) : dateStarted,
        createdAt: entry?.createdAt || new Date().toISOString(),
      };

      if (value !== undefined && value > 0) result.value = value;
      if (rating !== undefined && rating > 0) result.rating = rating;
      if (dateStarted) result.dateStarted = dateStarted;
      if (dateFinished) result.dateFinished = dateFinished;
      if (bookType) result.bookType = bookType;

      await this.onSave(result);
      this.finish(result);
      })();
    });
  }

  private confirmDeleteBook(bookName: string): void {
    const onDelete = this.options?.onDeleteBook;
    const app = this.app;
    const finish = () => this.finish(null);
    const modal = new (class extends Modal {
      onOpen(): void {
        this.contentEl.addClass("lc-modal");
        this.contentEl.createEl("h3", { text: t("deleteBookTitle") });
        this.contentEl.createEl("p", { text: t("deleteBookWarning", { name: bookName }) });
        const row = this.contentEl.createDiv({ cls: "lc-modal-row" });
        row.createEl("button", { cls: "lc-modal-cancel", text: t("cancel") }).addEventListener("click", () => this.close());
        row.createEl("button", { cls: "mod-cta mod-warning", text: t("deleteBookConfirm") }).addEventListener("click", () => {
          void (async () => {
            if (onDelete) await onDelete(bookName);
            this.close();
            finish();
          })();
        });
      }
    })(app);
    modal.open();
  }

  onClose(): void {
    this.contentEl.empty();
    if (this.resolveFn) {
      this.resolveFn(this.result);
      this.resolveFn = null;
    }
  }
}
