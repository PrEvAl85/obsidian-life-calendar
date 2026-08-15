import { ItemView, WorkspaceLeaf, TFile, Notice, DropdownComponent } from "obsidian";
import LifeCalendarPlugin from "./main";
import {
  HEART_COLORS, RING_COLORS, JournalEntry, LifeEvent, LifeZone, WeekStyle,
  ExerciseDefinition, ExerciseEntry, ExerciseStats, MonthlyExerciseStats, WeeklyExerciseStats,
  BookDefinition, BookEntry, BookStats, MonthlyBookStats, WeeklyBookStats, BookType,
  EXERCISE_UNIT_LABELS, HEATMAP_COLORS
} from "./types";
import { keyToDmy, dmyToKey, weekdayName, weekKeyOf } from "./util";
import { addDays, addYears, diffDays, diffYears, formatKey, isValidKey, mondayKeyOf, monthDayOf, todayKey, yearOf } from "./date";
import { AddEntryModal, EventsModal, FeedModal, ImportModal, WeekModal, ZonesModal, AddExerciseRecordModal, AddBookRecordModal } from "./modals";
import { t, monthNameGen, monthNameNom } from "./i18n";

export const VIEW_TYPE_LIFE_CALENDAR = "life-calendar-view";

interface WeekSource {
  entries: JournalEntry[];
}

export class LifeCalendarView extends ItemView {
  constructor(
    leaf: WorkspaceLeaf,
    private plugin: LifeCalendarPlugin,
  ) {
    super(leaf);
  }

  private mode: 'calendar' | 'tracker' | 'books' = 'calendar';
  private trackerYear: number = new Date().getFullYear();
  private trackerType: 'exercises' | 'books' = 'exercises';
  private selectedExercise: string = 'total';
  private selectedDay: string | null = null;

  getViewType(): string {
    return VIEW_TYPE_LIFE_CALENDAR;
  }

  getDisplayText(): string {
    return "Life Calendar";
  }

  getIcon(): string {
    return "heart";
  }

  async onOpen(): Promise<void> {
    await this.render();
  }

  async onClose(): Promise<void> {
    this.contentEl.empty();
  }

  async render(): Promise<void> {
    if (this.mode === 'tracker') {
      await this.renderTrackerTab();
    } else {
      await this.renderCalendar();
    }
  }

  openTrackerType(type: 'exercises' | 'books'): void {
    this.mode = 'tracker';
    this.trackerType = type;
    void this.render();
  }

  setTrackerType(type: 'exercises' | 'books'): void {
    this.trackerType = type;
    this.mode = 'tracker';
  }

  private async deleteBookEntry(entry: BookEntry): Promise<void> {
    await this.plugin.bookTrackerStore.removeEntryFromDailyNote(entry);
    await this.renderTrackerTab();
  }

  private async editBookEntry(entry: BookEntry): Promise<void> {
    const journalBooks = await this.plugin.bookTrackerStore.getJournalBooks();
    const jb = journalBooks.find(
      (b) => b.bookId === entry.bookId || b.name.toLowerCase() === entry.name.toLowerCase(),
    );
    const isBookStart = !!jb && jb.dateStarted === entry.date;

    new AddBookRecordModal(this.app, {
      bookTrackerStore: this.plugin.bookTrackerStore
    }, async (updated) => {
      if (isBookStart) {
        await this.plugin.bookTrackerStore.removeEntryFromDailyNote(entry);
        await this.plugin.bookTrackerStore.updateBookAcrossJournal(entry.name, updated);
        await this.plugin.bookTrackerStore.saveEntryToDailyNote(updated);
      } else {
        await this.plugin.bookTrackerStore.updateEntryInDailyNote(updated, entry.name);
      }
      await this.renderTrackerTab();
    }, entry, undefined, {
      isBookStart,
      onDeleteBook: async (bookName) => {
        await this.plugin.bookTrackerStore.deleteBookCompletely(bookName);
        new Notice(t("bookDeleted"));
        await this.renderTrackerTab();
      },
    }).open();
  }

  private async deleteExerciseEntry(entry: ExerciseEntry): Promise<void> {
    await this.plugin.exerciseTrackerStore.removeEntryFromDailyNote(entry);
    await this.renderTrackerTab();
  }

  private async renderCalendar(): Promise<void> {
    const container = this.contentEl;
    while (container.firstChild) container.removeChild(container.firstChild);
    const s = this.plugin.settings;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(s.birthDate)) {
      container.createDiv({ cls: "lc-no-birthdate", text: t("noBirthDate") });
      return;
    }

    const journalStore = this.plugin.journal;
    const eventsStore = this.plugin.events;

    const entries = await journalStore.listAll();
    const events: LifeEvent[] = await eventsStore.read();

    const today = todayKey();
    const start = s.birthDate;
    if (!isValidKey(start)) {
      container.createDiv({ cls: "lc-no-birthdate", text: t("invalidBirthDate") });
      return;
    }

    const yearsLived = diffYears(start, today);
    const lastBirthday = addYears(start, yearsLived);
    const weeksSinceLastBirthday = Math.floor(diffDays(lastBirthday, today) / 7);

    // Недели с записями: weekKey -> записи
    const srcCache = new Map<string, WeekSource>();
    const entryKeyCache = new Map<string, string>();
    for (const e of entries) {
      const mk = mondayKeyOf(e.date);
      let src = srcCache.get(mk);
      if (!src) {
        src = { entries: [] };
        srcCache.set(mk, src);
        entryKeyCache.set(mk, mk);
      }
      src.entries.push(e);
    }
    for (const src of srcCache.values()) {
      src.entries.sort((a, b) => a.date.localeCompare(b.date));
    }

    const cols = 52;
    const lifespan = s.lifespanYears;
    const filledChar = "♥";
    const emptyChar = "♡";

    // --- HTML
    const tool = container.createDiv({ cls: "life-cal-toolbar" });
    const addBtn = tool.createEl("button", { cls: "add-btn", text: t("addEntryBtn") });
    addBtn.type = "button";
    const evBtn = tool.createEl("button", { cls: "add-btn", text: t("eventsBtn") });
    evBtn.type = "button";
    const zoneBtn = tool.createEl("button", { cls: "add-btn", text: t("zonesBtn") });
    zoneBtn.type = "button";
    const feedBtn = tool.createEl("button", { cls: "add-btn", text: t("feedBtn") });
    feedBtn.type = "button";
    const expBtn = tool.createEl("button", { cls: "add-btn", text: t("exportBtn") });
    expBtn.type = "button";
    const impBtn = tool.createEl("button", { cls: "add-btn", text: t("importBtn") });
    impBtn.type = "button";
    
    const trackerDropdownWrap = tool.createEl("div", { cls: "lc-tracker-dropdown-wrap" });
    const trackerSelect = new DropdownComponent(trackerDropdownWrap);
    trackerSelect.addOption("", t("exerciseTrackerTab"));
    trackerSelect.addOption("books", t("books"));
    trackerSelect.addOption("exercises", t("exercises"));
    trackerDropdownWrap.createSpan({ cls: "lc-test-badge", text: "TEST" });
    
    trackerSelect.onChange((value) => {
      if (value === "books") {
        this.plugin.openBookTracker();
        trackerSelect.setValue("");
      } else if (value === "exercises") {
        this.plugin.openExerciseTracker();
        trackerSelect.setValue("");
      }
    });

    const legend = container.createDiv({ cls: "legend" });
    legend.textContent = t("legend", {
      birth: formatKey(start),
      today: formatKey(today),
      age: yearsLived,
      weeks: weeksSinceLastBirthday,
      weeksWith: srcCache.size,
    });

    const wrap = container.createDiv({ cls: "life-cal-wrap" });
    const grid = wrap.createDiv({ cls: "life-cal" });
    const startYear = yearOf(start);

    for (let r = 0; r < lifespan; r++) {
      const year = startYear + r;
      const yearWeeks = buildWeeksForYear(year);
      const birthdayThisYear = year + "-" + monthDayOf(start);
      const ageThisYear = year - startYear;
      const row = grid.createDiv({ cls: "row" });
      row.createSpan({ cls: "age-label", text: String(ageThisYear) });

      for (let c = 0; c < cols; c++) {
        const weekStart = yearWeeks[c].startKey;
        const weekEnd = yearWeeks[c].endKey;

        let cls = "heart empty";
        let ch = emptyChar;
        let customColor: string | null = null;
        let tooltip = `${formatKey(weekStart)}–${formatKey(weekEnd)}`;

        if (year === startYear) {
          if (weekEnd < start) {
            cls = "heart empty";
            ch = emptyChar;
          } else if (weekStart <= today) {
            cls = "heart filled";
            ch = filledChar;
          }
        } else {
          if (weekStart <= today) {
            cls = "heart filled";
            ch = filledChar;
          }
        }

        const isBirthdayWeek = birthdayThisYear >= weekStart && birthdayThisYear <= weekEnd;

        if (isBirthdayWeek) {
          cls = "heart birthday";
          ch = filledChar;
          tooltip += t("birthdaySuffix");
        }

        if (!isBirthdayWeek) {
          for (const ev of events) {
            const evDate = ev.date;
            if (evDate >= weekStart && evDate <= weekEnd) {
              customColor = ev.color;
              tooltip = `${formatKey(evDate, true)} — ${ev.title}`;
              ch = filledChar;
              break;
            }
          }
        }

        // Зоны: подсветка пастельным фоном диапазона недель
        const zoneOverlaps: LifeZone[] = [];
        for (const z of s.zones) {
          if (z.start <= weekEnd && z.end >= weekStart) zoneOverlaps.push(z);
        }
        if (zoneOverlaps.length) {
          tooltip +=
            "\n🎨 " +
            zoneOverlaps
              .map((z) => `${z.title} (${formatKey(z.start)}–${formatKey(z.end)})`)
              .join(", ");
        }

        let mk = mondayKeyOf(weekStart);
        let src = srcCache.get(mk);
        if (!src) {
          // Частичные ячейки года могут охватывать несколько ISO-недель
          for (const k of srcCache.keys()) {
            const kd = entryKeyCache.get(k);
            if (kd && kd >= weekStart && kd <= weekEnd) {
              const cand = srcCache.get(k);
              if (cand) {
                mk = k;
                src = cand;
                break;
              }
            }
          }
        }
        if (src) {
          cls += " has-note";
          const tips = src.entries
            .slice(0, 7)
            .map((e) => `${keyToDmy(e.date)} (${weekdayName(e.date)}): ${e.text.replace(/\s+/g, " ").slice(0, 150)}`);
          tooltip += "\n📝 " + tips.join("\n");
          if (src.entries.length > 7) tooltip += t("moreEntries", { n: src.entries.length - 7 });
        }

        let ringColor: string | null = null;
        if (src) {
          cls += " js-tip";
          const st: WeekStyle = s.custom[mk] || {};
          if (st.color) customColor = st.color;
          if (st.ring) {
            ringColor = st.ring;
            cls += " has-ring";
          }
        }
        const cell = row.createSpan({ cls, attr: { "data-week": keyToDmy(mk), "data-tip": tooltip } });
        if (customColor) cell.style.setProperty("color", customColor);
        if (zoneOverlaps.length) {
          for (const z of zoneOverlaps) cell.classList.add("z-" + z.id);
        }
        if (ringColor) cell.style.setProperty("--lc-ring", ringColor);
        cell.createSpan({ cls: "h-glyph", text: ch });
      }

      row.createSpan({ cls: "year-label", text: String(year) });
    }

    this.renderZoneBands(wrap, s.zones);
    this.attachTooltip(grid, srcCache);
    this.attachClicks(grid, addBtn, evBtn, zoneBtn, feedBtn, expBtn, impBtn);
  }

  private renderZoneBands(wrap: HTMLElement, zones: LifeZone[]): void {
    const groups = zones
      .map((z) => ({ z, els: Array.from(wrap.querySelectorAll<HTMLElement>(".z-" + z.id)) }))
      .filter((g) => g.els.length > 0)
      .sort((a, b) => a.z.start.localeCompare(b.z.start));
    for (const { z, els } of groups) {
      const rowMap = new Map<HTMLElement, HTMLElement[]>();
      for (const el of els) {
        const row = el.parentElement;
        if (!row) continue;
        let arr = rowMap.get(row);
        if (!arr) {
          arr = [];
          rowMap.set(row, arr);
        }
        arr.push(el);
      }
      for (const [row, arr] of rowMap) {
        arr.sort((a, b) => a.offsetLeft - b.offsetLeft);
        const left = arr[0].offsetLeft;
        const right = arr[arr.length - 1].offsetLeft + arr[arr.length - 1].offsetWidth;
        const band = wrap.createDiv({ cls: "lc-zone-band" });
        band.style.left = left + "px";
        band.style.top = row.offsetTop + "px";
        band.style.width = right - left + "px";
        band.style.height = row.offsetHeight + 2 + "px";
        band.style.backgroundColor = z.color;
        band.title = `${z.title} (${formatKey(z.start)}–${formatKey(z.end)})`;
      }
    }
  }

  private attachTooltip(grid: HTMLElement, srcCache: Map<string, WeekSource>): void {
    const container = this.contentEl;
    const wrap = grid.parentElement as HTMLElement;
    const tip = wrap.createDiv({ cls: "lc-tip" });
    let tipTimer: number | null = null;
    let tipKey: string | null = null;

    const scheduleHideTip = () => {
      if (tipTimer !== null) window.clearTimeout(tipTimer);
      tipTimer = window.setTimeout(() => {
        tip.removeClass("is-visible");
        tipTimer = null;
      }, 180);
    };
    const updateTipState = () => {
      const st: WeekStyle = this.plugin.settings.custom[tipKey as string] || {};
      tip.querySelectorAll(".lc-csw").forEach((sw) => sw.classList.toggle("sel", sw.getAttribute("data-c") === st.color));
      tip.querySelectorAll(".lc-ring").forEach((r) => r.classList.toggle("sel", r.getAttribute("data-r") === st.ring));
    };
    const updateHeartStyle = (mk: string) => {
      const name = keyToDmy(mk);
      const el = wrap.querySelector<HTMLElement>('.heart[data-week="' + name + '"]');
      if (!el) return;
      const st: WeekStyle = this.plugin.settings.custom[mk] || {};
      const parts: string[] = [];
      if (st.color) parts.push("color:" + st.color);
      if (st.ring) parts.push("--lc-ring:" + st.ring);
      if (parts.length) el.setAttribute("style", parts.join("; "));
      else el.removeAttribute("style");
      el.classList.toggle("has-ring", !!st.ring);
    };
    const showTip = (el: HTMLElement) => {
      const name = el.getAttribute("data-week");
      if (!name) return;
      const mk = dmyToKey(name);
      if (!srcCache.get(mk)) return;
      if (tipTimer !== null) window.clearTimeout(tipTimer);
      if (!(tipKey === mk && tip.hasClass("is-visible"))) {
        tipKey = mk;
        while (tip.firstChild) tip.removeChild(tip.firstChild);
        const text = el.dataset.tip || "";
        const st: WeekStyle = this.plugin.settings.custom[mk] || {};
        const colorsRow = tip.createDiv({ cls: "lc-tip-colors" });
        for (const c of HEART_COLORS) {
          const sw = colorsRow.createDiv({ cls: "lc-csw" });
          sw.style.color = c;
          sw.textContent = "♥";
          sw.setAttribute("data-c", c);
          sw.title = t("colorTip");
          if (st.color === c) sw.classList.add("sel");
        }
        const creset = colorsRow.createEl("button", { cls: "lc-creset" });
        creset.type = "button";
        creset.textContent = "✕";
        creset.title = t("resetColor");
        const main = tip.createDiv({ cls: "lc-tip-main" });
        const textDiv = main.createDiv({ cls: "lc-tip-text" });
        textDiv.textContent = text;
        const rings = main.createDiv({ cls: "lc-tip-rings" });
        for (const r of RING_COLORS) {
          const ring = rings.createDiv({ cls: "lc-ring" });
          ring.style.setProperty("--ring-color", r);
          ring.setAttribute("data-r", r);
          ring.title = t("ringTip");
          if (st.ring === r) ring.classList.add("sel");
        }
        const rreset = rings.createEl("button", { cls: "lc-rreset" });
        rreset.type = "button";
        rreset.textContent = "✕";
        rreset.title = t("resetRing");
      }
      tip.addClass("is-visible");
      const hr = el.getBoundingClientRect();
      const wr = wrap.getBoundingClientRect();
      const vr = (container.closest(".view-content") || container).getBoundingClientRect();
      const tipW = tip.offsetWidth;
      const tipH = tip.offsetHeight;
      const visLeft = vr.left - wr.left;
      const visRight = vr.right - wr.left;
      const visTop = vr.top - wr.top;
      const visBottom = vr.bottom - wr.top;
      let left = hr.left - wr.left;
      if (left + tipW > visRight) left = hr.right - wr.left - tipW;
      if (left < visLeft) left = visLeft;
      let top = hr.bottom - wr.top + 4;
      if (top + tipH > visBottom) top = hr.top - wr.top - tipH - 4;
      if (top < visTop) top = visTop;
      tip.style.left = left + "px";
      tip.style.top = top + "px";
    };

    wrap.addEventListener("mouseover", (e) => {
      const heart = targetEl(e)?.closest(".heart.js-tip") as HTMLElement | null;
      if (!heart) return;
      if (tipTimer !== null) window.clearTimeout(tipTimer);
      showTip(heart);
    });
    wrap.addEventListener("mouseout", (e) => {
      const heart = targetEl(e)?.closest(".heart.js-tip") as HTMLElement | null;
      if (heart) scheduleHideTip();
    });
    tip.addEventListener("mouseenter", () => {
      if (tipTimer !== null) window.clearTimeout(tipTimer);
    });
    tip.addEventListener("mouseleave", () => scheduleHideTip());

    tip.addEventListener("click", (e) => {
      void (async () => {
      const mk = tipKey;
      if (!mk) return;
      const target = e.target as HTMLElement;
      const custom = this.plugin.settings.custom;
      const setStyle = async (patch: Partial<WeekStyle>, clearKey: keyof WeekStyle) => {
        if (!custom[mk]) custom[mk] = {};
        const current = custom[mk];
        if (current[clearKey] === patch[clearKey]) delete current[clearKey];
        else Object.assign(current, patch);
        await this.plugin.saveSettings();
        updateHeartStyle(mk);
        updateTipState();
      };
      const sw = target.closest(".lc-csw");
      if (sw) {
        const c = sw.getAttribute("data-c");
        if (c) await setStyle({ color: c }, "color");
        return;
      }
      const ring = target.closest(".lc-ring");
      if (ring) {
        const r = ring.getAttribute("data-r");
        if (r) await setStyle({ ring: r }, "ring");
        return;
      }
      if (target.closest(".lc-creset")) {
        if (custom[mk]) delete custom[mk].color;
        await this.plugin.saveSettings();
        updateHeartStyle(mk);
        updateTipState();
        return;
      }
      if (target.closest(".lc-rreset")) {
        if (custom[mk]) delete custom[mk].ring;
        await this.plugin.saveSettings();
        updateHeartStyle(mk);
        updateTipState();
        return;
      }
      })();
    });
  }

  private attachClicks(
    grid: HTMLElement,
    addBtn: HTMLElement,
    evBtn: HTMLElement,
    zoneBtn: HTMLElement,
    feedBtn: HTMLElement,
    expBtn: HTMLElement,
    impBtn: HTMLElement,
  ): void {
    const today = todayKey();

    addBtn.addEventListener("click", () => {
      new AddEntryModal(this.app, today, async (date, text) => {
        const path = await this.plugin.journal.addEntry(date, text);
        new Notice(t("entryAdded", { path }));
        await this.render();
      }, this.plugin.settings.journalFolder).open();
    });

    evBtn.addEventListener("click", () => {
      new EventsModal(
        this.app,
        () => this.plugin.events.read(),
        async (events) => this.plugin.events.write(events),
      ).open();
    });

    zoneBtn.addEventListener("click", () => {
      new ZonesModal(
        this.app,
        () => this.plugin.settings.zones,
        async (zones) => {
          this.plugin.settings.zones = zones;
          await this.plugin.saveSettings();
          await this.render();
        },
      ).open();
    });

    feedBtn.addEventListener("click", () => {
      new FeedModal(
        this.app,
        () => this.plugin.journal.listAll(),
        {
          updateEntry: async (oldDate, index, newDate, text) => {
            await this.plugin.journal.updateEntry(oldDate, index, newDate, text);
          },
          deleteEntry: async (date, index) => {
            await this.plugin.journal.deleteEntry(date, index);
          },
          moveEntry: async (date, index, dir) => {
            await this.plugin.journal.moveEntry(date, index, dir);
          },
          openDayNote: async (path) => {
            const f = this.app.vault.getAbstractFileByPath(path) as TFile | null;
            if (f) await this.app.workspace.getLeaf(true).openFile(f);
          },
        },
        this.plugin.settings.journalFolder,
      ).open();
    });

    expBtn.addEventListener("click", () => {
      void (async () => {
        try {
          const entries = await this.plugin.journal.listAll();
          const events = await this.plugin.events.read();
          const json = this.plugin.export.buildJson(entries, events);
          const path = await this.plugin.export.writeBackup(json);
          new Notice(t("exportDone", { path, entries: entries.length, events: events.length }), 6000);
        } catch (err: unknown) {
          console.error("Life Calendar: export", err);
          new Notice(t("exportError", { error: err instanceof Error ? err.message : String(err) }));
        }
      })();
    });

    impBtn.addEventListener("click", () => {
      new ImportModal(
        this.app,
        this.plugin.settings.exportFile,
        !this.plugin.settings.birthDate,
        (content, applyMeta) => this.plugin.importFromJson(content, applyMeta),
      ).open();
    });
    grid.addEventListener("click", (evt) => {
      const heart = targetEl(evt)?.closest(".heart") as HTMLElement | null;
      if (!heart) return;
      evt.preventDefault();
      evt.stopPropagation();
      const name = heart.getAttribute("data-week");
      if (!name) return;
      const mk = dmyToKey(name);
      new WeekModal(
        this.app,
        mk,
        async () => {
          const [entries, events] = await Promise.all([
            this.plugin.journal.getWeek(mk),
            this.plugin.events.read(),
          ]);
          return {
            entries,
            events: events.filter((ev) => weekKeyOf(ev.date) === mk),
          };
        },
        {
          addEntry: async (date, text) => {
            await this.plugin.journal.addEntry(date, text);
          },
          updateEntry: async (oldDate, index, newDate, text) => {
            await this.plugin.journal.updateEntry(oldDate, index, newDate, text);
          },
          deleteEntry: async (date, index) => {
            await this.plugin.journal.deleteEntry(date, index);
          },
          moveEntry: async (date, index, dir) => {
            await this.plugin.journal.moveEntry(date, index, dir);
          },
          addEvent: async (ev) => {
            await this.plugin.events.add(ev);
          },
          updateEvent: async (old, next) => {
            await this.plugin.events.update(old, next);
          },
          deleteEvent: async (ev) => {
            await this.plugin.events.remove(ev.date, ev.title);
          },
          openDayNote: async (path) => {
            const f = this.app.vault.getAbstractFileByPath(path) as TFile | null;
            if (f) await this.app.workspace.getLeaf(true).openFile(f);
          },
        },
this.plugin.settings.journalFolder,
        ).open();
    });
  }

  // ===== Exercise Tracker Tab =====

  private async renderTrackerTab(): Promise<void> {
    if (this.trackerType === 'books') {
      await this.renderBookTrackerTab();
    } else {
      await this.renderExerciseTrackerTab();
    }
  }

  private async renderExerciseTrackerTab(): Promise<void> {
    const container = this.contentEl;
    while (container.firstChild) container.removeChild(container.firstChild);
    const root = container.createDiv({ cls: "lc-tracker" });

    const tool = root.createDiv({ cls: "tracker-toolbar" });
    const backBtn = tool.createEl("button", { cls: "add-btn", text: t("exerciseBack") });
    backBtn.type = "button";
    backBtn.addEventListener("click", () => {
      this.mode = "calendar";
      void this.render();
    });

    tool.createEl("span", { cls: "tracker-title", text: t("exerciseTrackerTab") });

    const addBtn = tool.createEl("button", { cls: "add-btn", text: t("exerciseAddRecord") });
    addBtn.type = "button";
    addBtn.addEventListener("click", () => {
      new AddExerciseRecordModal(this.app, this.plugin.exerciseTrackerStore, async (entry) => {
        await this.plugin.exerciseTrackerStore.saveEntryToDailyNote(entry);
        new Notice(t("exerciseSaved"));
        await this.renderTrackerTab();
      }).open();
    });

    tool.createEl("span", { cls: "tracker-toolbar-spacer" });

    tool.createEl("span", { cls: "tracker-year-label", text: t("exerciseHeatmapYear") + " " });
    const yearSel = tool.createEl("select", { cls: "tracker-year-select" });
    for (let y = this.trackerYear - 3; y <= this.trackerYear + 3; y++) {
      const opt = yearSel.createEl("option", { text: String(y) });
      opt.value = String(y);
      if (y === this.trackerYear) opt.selected = true;
    }
    yearSel.addEventListener("change", () => {
      this.trackerYear = parseInt(yearSel.value, 10) || new Date().getFullYear();
      void this.renderTrackerTab();
    });

    const exercises = this.plugin.exerciseTrackerStore.getExercises();
    const exSel = tool.createEl("select", { cls: "tracker-exercise-select" });
    const allOpt = exSel.createEl("option", { text: t("exerciseAll") });
    allOpt.value = "total";
    for (const ex of exercises) {
      const opt = exSel.createEl("option", { text: ex.name });
      opt.value = ex.id;
    }
    exSel.value = this.selectedExercise;
    exSel.addEventListener("change", () => {
      this.selectedExercise = exSel.value;
      void this.renderTrackerTab();
    });

    const store = this.plugin.exerciseTrackerStore;
    const allEntries = await store.loadAllEntries();
    const daily = new Map<string, number>();
    for (const [date, entries] of allEntries) {
      if (!date.startsWith(String(this.trackerYear))) continue;
      let sum = 0;
      for (const e of entries) {
        if (this.selectedExercise !== "total" && e.exerciseId !== this.selectedExercise) continue;
        sum += e.value;
      }
      if (sum > 0) daily.set(date, sum);
    }
    const maxDaily = daily.size ? Math.max(...daily.values()) : 0;

    this.renderTrackerStats(root, daily, "exercise");
    this.renderYearHeatmap(root, daily, maxDaily, "exercise");
    this.renderDayDetail(root, allEntries, "exercise");
    this.renderTrackerTables(root, allEntries, "exercise");
  }

  private async renderBookTrackerTab(): Promise<void> {
    const container = this.contentEl;
    while (container.firstChild) container.removeChild(container.firstChild);
    const root = container.createDiv({ cls: "lc-tracker" });

    const tool = root.createDiv({ cls: "tracker-toolbar" });
    const backBtn = tool.createEl("button", { cls: "add-btn", text: t("exerciseBack") });
    backBtn.type = "button";
    backBtn.addEventListener("click", () => {
      this.mode = "calendar";
      void this.render();
    });

    tool.createEl("span", { cls: "tracker-title", text: t("bookTrackerTab") });

    const addBtn = tool.createEl("button", { cls: "add-btn", text: t("addBookRecord") });
    addBtn.type = "button";
    addBtn.addEventListener("click", () => {
      void (async () => {
      let prefillName: string | undefined;
      let prefillAuthor: string | undefined;
      let prefillBookType: BookType | undefined;
      let prefillDateStarted: string | undefined;
      let prefillBookId: string | undefined;
      if (this.selectedExercise !== "total") {
        const def = this.plugin.bookTrackerStore.getBookById(this.selectedExercise);
        if (def) {
          prefillName = def.name;
          prefillAuthor = def.author;
          prefillBookType = def.bookType;
          prefillBookId = def.id;
        } else {
          const jb = (await this.plugin.bookTrackerStore.getJournalBooks()).find(b => b.bookId === this.selectedExercise);
          if (jb) {
            prefillName = jb.name;
            prefillAuthor = jb.author;
            prefillBookType = jb.bookType;
            prefillDateStarted = jb.dateStarted;
            prefillBookId = jb.bookId;
          }
        }
      }
      new AddBookRecordModal(this.app, {
        bookTrackerStore: this.plugin.bookTrackerStore
      }, async (entry) => {
        await this.plugin.bookTrackerStore.saveEntryToDailyNote(entry);
        new Notice(t("bookAdded"));
        await this.renderBookTrackerTab();
      }, null, { name: prefillName, author: prefillAuthor, bookType: prefillBookType, dateStarted: prefillDateStarted, bookId: prefillBookId }).open();
      })();
    });

    tool.createEl("span", { cls: "tracker-toolbar-spacer" });

    tool.createEl("span", { cls: "tracker-year-label", text: t("exerciseHeatmapYear") + " " });
    const yearSel = tool.createEl("select", { cls: "tracker-year-select" });
    for (let y = this.trackerYear - 3; y <= this.trackerYear + 3; y++) {
      const opt = yearSel.createEl("option", { text: String(y) });
      opt.value = String(y);
      if (y === this.trackerYear) opt.selected = true;
    }
    yearSel.addEventListener("change", () => {
      this.trackerYear = parseInt(yearSel.value, 10) || new Date().getFullYear();
      void this.renderBookTrackerTab();
    });

    const store = this.plugin.bookTrackerStore;
    const books = store.getBooks();
    const journalBooks = await store.getJournalBooks();
    const bookSel = tool.createEl("select", { cls: "tracker-exercise-select" });
    const allOpt = bookSel.createEl("option", { text: t("exerciseAll") });
    allOpt.value = "total";
    const seenBookIds = new Set<string>();
    for (const book of books) {
      seenBookIds.add(book.id);
      const opt = bookSel.createEl("option", { text: book.name });
      opt.value = book.id;
    }
    for (const jb of journalBooks) {
      if (seenBookIds.has(jb.bookId)) continue;
      seenBookIds.add(jb.bookId);
      const opt = bookSel.createEl("option", { text: jb.author ? `${jb.name} — ${jb.author}` : jb.name });
      opt.value = jb.bookId;
    }
    bookSel.value = this.selectedExercise;
    bookSel.addEventListener("change", () => {
      this.selectedExercise = bookSel.value;
      void this.renderBookTrackerTab();
    });

    const allEntries = await store.loadAllEntries();
    const daily = new Map<string, number>();
    const bookActivity = new Set<string>();
    const readBooks = new Set<string>();
    for (const [date, entries] of allEntries) {
      if (!date.startsWith(String(this.trackerYear))) continue;
      let sum = 0;
      let hasEntry = false;
      for (const e of entries) {
        if (this.selectedExercise !== "total" && e.bookId !== this.selectedExercise) continue;
        hasEntry = true;
        sum += e.value || 0;
        if (e.read) readBooks.add(e.bookId || e.name);
      }
      if (hasEntry) bookActivity.add(date);
      if (sum > 0) daily.set(date, sum);
    }
    const maxDaily = daily.size ? Math.max(...daily.values()) : 0;

    this.renderTrackerStats(root, daily, "book", readBooks.size);
    this.renderYearHeatmap(root, daily, maxDaily, "book", bookActivity);
    this.renderDayDetail(root, allEntries, "book");
    this.renderTrackerTables(root, allEntries, "book");
    this.renderReadBooks(root, allEntries);
  }

  private renderReadBooks(root: HTMLElement, allEntries: Map<string, BookEntry[]>): void {
    const readMap = new Map<string, BookEntry>();
    for (const [date, entries] of allEntries) {
      for (const e of entries) {
        if (!e.read) continue;
        const key = e.bookId || e.name;
        if (!readMap.has(key)) {
          readMap.set(key, { ...e, date });
        }
      }
    }
    if (readMap.size === 0) return;

    const section = root.createDiv({ cls: "tracker-read-books" });
    section.createDiv({ cls: "tracker-table-title", text: t("bookStatsBooksRead") + " (" + readMap.size + ")" });
    const list = section.createDiv({ cls: "tracker-read-books-list" });
    const sorted = [...readMap.values()].sort((a, b) => a.date.localeCompare(b.date));
    for (const e of sorted) {
      const item = list.createDiv({ cls: "tracker-read-book-item" });
      item.createEl("span", { cls: "tracker-read-book-name", text: e.name });
      if (e.author) item.createEl("span", { cls: "tracker-read-book-author", text: e.author });
      item.createEl("span", { cls: "tracker-read-book-date", text: keyToDmy(e.date) });
      if (e.value && e.value > 0) {
        item.createEl("span", { cls: "tracker-read-book-value", text: `${e.value} стр.` });
      }
    }
  }

  private renderTrackerStats(root: HTMLElement, daily: Map<string, number>, type: 'exercise' | 'book', booksRead = 0): void {
    const summary = root.createDiv({ cls: "tracker-summary" });
    let total = 0;
    let best: { date: string; value: number } | null = null;
    for (const [date, value] of daily) {
      total += value;
      if (!best || value > best.value) best = { date, value };
    }
    const streak = this.computeStreak(daily);

    if (type === 'book') {
      this.statCard(summary, String(total) + " стр.", t("bookStatsTotalPages"));
      this.statCard(summary, String(booksRead) + " " + t("bookStatsBooksRead"), t("bookStatsBooksRead"));
      this.statCard(summary, String(streak) + " " + t("exerciseTableDays"), t("bookStatsBestStreak"));
      this.statCard(summary, best ? keyToDmy(best.date) : "—", t("bookStatsBestDay"));
    } else {
      this.statCard(summary, String(total), t("exerciseStatsTotal"));
      this.statCard(summary, String(daily.size), t("exerciseStatsActiveDays"));
      this.statCard(summary, String(streak) + " " + t("exerciseTableDays"), t("exerciseStatsBestStreak"));
      this.statCard(summary, best ? keyToDmy(best.date) : "—", t("exerciseStatsBestDay"));
    }
  }

  private statCard(summary: HTMLElement, value: string, label: string): void {
    const card = summary.createDiv({ cls: "tracker-stat-card" });
    card.createDiv({ cls: "tracker-stat-value", text: value });
    card.createDiv({ cls: "tracker-stat-label", text: label });
  }

  private computeStreak(daily: Map<string, number>): number {
    const dates = Array.from(daily.keys()).sort();
    if (!dates.length) return 0;
    let best = 1;
    let cur = 1;
    for (let i = 1; i < dates.length; i++) {
      const diff = diffDays(dates[i - 1], dates[i]);
      if (diff === 1) {
        cur++;
        if (cur > best) best = cur;
      } else {
        cur = 1;
      }
    }
    return best;
  }

  private renderYearHeatmap(root: HTMLElement, daily: Map<string, number>, maxDaily: number, type: 'exercise' | 'book', extraActive?: Set<string>): void {
    const heatmap = root.createDiv({ cls: "tracker-heatmap" });
    const months = heatmap.createDiv({ cls: "tracker-months" });
    const year = this.trackerYear;
    const today = todayKey();
    const dowLabels = [
      weekdayName(year + "-01-06"),
      weekdayName(year + "-01-07"),
      weekdayName(year + "-01-01"),
      weekdayName(year + "-01-02"),
      weekdayName(year + "-01-03"),
      weekdayName(year + "-01-04"),
      weekdayName(year + "-01-05"),
    ];

    for (let m = 1; m <= 12; m++) {
      const month = months.createDiv({ cls: "tracker-month" });
      month.createDiv({ cls: "tracker-month-header", text: monthNameNom(m - 1) });
      const dow = month.createDiv({ cls: "tracker-dow" });
      for (const label of dowLabels) dow.createDiv({ text: label.slice(0, 2) });

      const grid = month.createDiv({ cls: "tracker-grid" });
      const daysInMonth = new Date(year, m, 0).getDate();
      const firstDow = (new Date(year, m - 1, 1).getDay() + 6) % 7;
      for (let i = 0; i < firstDow; i++) grid.createDiv({ cls: "tracker-day empty" });

      for (let d = 1; d <= daysInMonth; d++) {
        const date = `${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        const value = daily.get(date) || 0;
        let level = 0;
        if (value > 0 && maxDaily > 0) {
          level = Math.min(4, Math.ceil((value / maxDaily) * 4));
        } else if (extraActive?.has(date)) {
          level = 1;
        }
        const cell = grid.createDiv({ cls: `tracker-day level-${level}` });
        cell.textContent = String(d);
        if (extraActive?.has(date) && value === 0) {
          cell.addClass("tracker-day-book");
        }
        cell.title = value > 0 ? `${keyToDmy(date)}: ${value}` : keyToDmy(date);
        if (date === today) cell.addClass("today");
        if (this.selectedDay === date) cell.addClass("selected");
        cell.addEventListener("click", () => {
          this.selectedDay = this.selectedDay === date ? null : date;
          void this.renderTrackerTab();
        });
      }
    }
  }

  private renderDayDetail(root: HTMLElement, allEntries: Map<string, ExerciseEntry[] | BookEntry[]>, type: 'exercise' | 'book'): void {
    if (!this.selectedDay) return;
    
    if (type === 'book') {
      const entries = (allEntries as Map<string, BookEntry[]>).get(this.selectedDay) || [];
      const filtered = entries.filter(
        (e) => this.selectedExercise === "total" || e.bookId === this.selectedExercise,
      );
      const detail = root.createDiv({ cls: "tracker-day-detail" });
      const head = detail.createDiv({ cls: "tracker-day-detail-head" });
      head.createEl("strong", { text: `${t("bookDay")}: ${keyToDmy(this.selectedDay)}` });
      const close = head.createEl("button", { cls: "lc-modal-cancel", text: "✕" });
      close.type = "button";
      close.addEventListener("click", () => {
        this.selectedDay = null;
        void this.renderTrackerTab();
      });
      if (!filtered.length) {
        detail.createDiv({ cls: "tracker-hint", text: t("bookNoEntries") });
        return;
      }
      const list = detail.createDiv({ cls: "tracker-day-list" });
      for (const e of filtered) {
        let text = e.name;
        if (e.author) text += ` (${e.author})`;
        if (e.value !== undefined && e.value > 0) {
          text += `: ${e.value} стр.`;
          if (e.rating) text += ` ★${e.rating}`;
        }
        const item = list.createDiv({ cls: "tracker-day-item" });
        item.createEl("span", { text });
        const editBtn = item.createEl("button", { cls: "tracker-day-edit", text: "✏️" });
        editBtn.type = "button";
        editBtn.title = "Редактировать";
        editBtn.addEventListener("click", () => {
          void this.editBookEntry(e);
        });
        const delBtn = item.createEl("button", { cls: "tracker-day-del", text: "🗑" });
        delBtn.type = "button";
        delBtn.title = "Удалить";
        delBtn.addEventListener("click", () => {
          void this.deleteBookEntry(e);
        });
      }
    } else {
      const entries = (allEntries as Map<string, ExerciseEntry[]>).get(this.selectedDay) || [];
      const filtered = entries.filter(
        (e) => this.selectedExercise === "total" || e.exerciseId === this.selectedExercise,
      );
      const detail = root.createDiv({ cls: "tracker-day-detail" });
      const head = detail.createDiv({ cls: "tracker-day-detail-head" });
      head.createEl("strong", { text: `${t("exerciseDay")}: ${keyToDmy(this.selectedDay)}` });
      const close = head.createEl("button", { cls: "lc-modal-cancel", text: "✕" });
      close.type = "button";
      close.addEventListener("click", () => {
        this.selectedDay = null;
        void this.renderTrackerTab();
      });
      if (!filtered.length) {
        detail.createDiv({ cls: "tracker-hint", text: t("exerciseNoEntries") });
        return;
      }
      const list = detail.createDiv({ cls: "tracker-day-list" });
      for (const e of filtered) {
        const unit = e.unit === "custom" ? (e.customUnit || t("custom")) : EXERCISE_UNIT_LABELS[e.unit] || e.unit;
        const item = list.createDiv({ cls: "tracker-day-item" });
        item.createEl("span", { text: `${e.name}: ${e.value} ${unit}` });
        const delBtn = item.createEl("button", { cls: "tracker-day-del", text: "🗑" });
        delBtn.type = "button";
        delBtn.title = "Удалить";
        delBtn.addEventListener("click", () => {
          void this.deleteExerciseEntry(e);
        });
      }
    }
  }

  private renderTrackerTables(root: HTMLElement, allEntries: Map<string, ExerciseEntry[] | BookEntry[]>, type: 'exercise' | 'book'): void {
    const tables = root.createDiv({ cls: "tracker-tables" });
    const year = String(this.trackerYear);

    if (type === 'book') {
      const entries = allEntries as Map<string, BookEntry[]>;
      const monthAgg = new Map<string, { days: number; total: number }>();
      const weekAgg = new Map<string, { days: number; total: number }>();

      for (const [date, dayEntries] of entries) {
        if (!date.startsWith(year)) continue;
        let sum = 0;
        for (const e of dayEntries) {
          if (this.selectedExercise !== "total" && e.bookId !== this.selectedExercise) continue;
          sum += e.value || 0;
        }
        if (sum <= 0) continue;

        const ym = date.slice(0, 7);
        const mm = monthAgg.get(ym) || { days: 0, total: 0 };
        mm.days++;
        mm.total += sum;
        monthAgg.set(ym, mm);

        const wk = weekKeyOf(date);
        const ww = weekAgg.get(wk) || { days: 0, total: 0 };
        ww.days++;
        ww.total += sum;
        weekAgg.set(wk, ww);
      }

      if (monthAgg.size) {
        tables.createDiv({ cls: "tracker-table-title", text: t("bookTableMonth") });
        const monthTable = tables.createEl("table", { cls: "tracker-table" });
        const headRow = monthTable.createEl("tr");
        headRow.createEl("th", { text: t("exerciseTableMonth") });
        headRow.createEl("th", { text: t("exerciseTableDays") });
        headRow.createEl("th", { text: t("bookStatsTotalPages") });
        const sortedMonths = Array.from(monthAgg.keys()).sort();
        for (const ym of sortedMonths) {
          const agg = monthAgg.get(ym)!;
          const m = parseInt(ym.slice(5, 7), 10);
          const row = monthTable.createEl("tr");
          row.createEl("td", { text: monthNameGen(m - 1) });
          row.createEl("td", { text: String(agg.days) });
          row.createEl("td", { cls: "tracker-total", text: String(agg.total) });
        }
      }

      if (weekAgg.size) {
        tables.createDiv({ cls: "tracker-table-title", text: t("bookTableWeek") });
        const weekTable = tables.createEl("table", { cls: "tracker-table" });
        const headRow = weekTable.createEl("tr");
        headRow.createEl("th", { text: t("exerciseTableWeek") });
        headRow.createEl("th", { text: t("exerciseTableDays") });
        headRow.createEl("th", { text: t("bookStatsTotalPages") });
        const sortedWeeks = Array.from(weekAgg.keys()).sort();
        for (const wk of sortedWeeks) {
          const agg = weekAgg.get(wk)!;
          const row = weekTable.createEl("tr");
          row.createEl("td", { text: `${formatKey(wk)}–${formatKey(addDays(wk, 6))}` });
          row.createEl("td", { text: String(agg.days) });
          row.createEl("td", { cls: "tracker-total", text: String(agg.total) });
        }
      }

      if (!monthAgg.size && !weekAgg.size) {
        tables.createDiv({ cls: "tracker-hint", text: t("bookNoData") });
      }
    } else {
      const entries = allEntries as Map<string, ExerciseEntry[]>;
      const monthAgg = new Map<string, { days: number; total: number }>();
      const weekAgg = new Map<string, { days: number; total: number }>();

      for (const [date, entriesList] of entries) {
        if (!date.startsWith(year)) continue;
        let sum = 0;
        for (const e of entriesList) {
          if (this.selectedExercise !== "total" && e.exerciseId !== this.selectedExercise) continue;
          sum += e.value;
        }
        if (sum <= 0) continue;

        const ym = date.slice(0, 7);
        const mm = monthAgg.get(ym) || { days: 0, total: 0 };
        mm.days++;
        mm.total += sum;
        monthAgg.set(ym, mm);

        const wk = weekKeyOf(date);
        const ww = weekAgg.get(wk) || { days: 0, total: 0 };
        ww.days++;
        ww.total += sum;
        weekAgg.set(wk, ww);
      }

      if (monthAgg.size) {
        tables.createDiv({ cls: "tracker-table-title", text: t("exerciseTableMonth") });
        const monthTable = tables.createEl("table", { cls: "tracker-table" });
        const headRow = monthTable.createEl("tr");
        headRow.createEl("th", { text: t("exerciseTableMonth") });
        headRow.createEl("th", { text: t("exerciseTableDays") });
        headRow.createEl("th", { text: t("exerciseTableTotal") });
        const sortedMonths = Array.from(monthAgg.keys()).sort();
        for (const ym of sortedMonths) {
          const agg = monthAgg.get(ym)!;
          const m = parseInt(ym.slice(5, 7), 10);
          const row = monthTable.createEl("tr");
          row.createEl("td", { text: monthNameGen(m - 1) });
          row.createEl("td", { text: String(agg.days) });
          row.createEl("td", { cls: "tracker-total", text: String(agg.total) });
        }
      }

      if (weekAgg.size) {
        tables.createDiv({ cls: "tracker-table-title", text: t("exerciseTableWeek") });
        const weekTable = tables.createEl("table", { cls: "tracker-table" });
        const headRow = weekTable.createEl("tr");
        headRow.createEl("th", { text: t("exerciseTableWeek") });
        headRow.createEl("th", { text: t("exerciseTableDays") });
        headRow.createEl("th", { text: t("exerciseTableTotal") });
        const sortedWeeks = Array.from(weekAgg.keys()).sort();
        for (const wk of sortedWeeks) {
          const agg = weekAgg.get(wk)!;
          const row = weekTable.createEl("tr");
          row.createEl("td", { text: `${formatKey(wk)}–${formatKey(addDays(wk, 6))}` });
          row.createEl("td", { text: String(agg.days) });
          row.createEl("td", { cls: "tracker-total", text: String(agg.total) });
        }
      }

      if (!monthAgg.size && !weekAgg.size) {
        tables.createDiv({ cls: "tracker-hint", text: t("exerciseNoData") });
      }
    }
  }
}

function targetEl(e: Event): HTMLElement | null {
  return e.target instanceof HTMLElement ? e.target : null;
}

interface WeekRange {
  startKey: string;
  endKey: string;
}

function buildWeeksForYear(year: number, cols = 52): WeekRange[] {
  const yearStart = year + "-01-01";
  const yearEnd = year + "-12-31";
  const weeks: WeekRange[] = [];
  let wStart = yearStart;
  let wEnd = addDays(mondayKeyOf(yearStart), 6);
  if (wEnd > yearEnd) wEnd = yearEnd;
  weeks.push({ startKey: wStart, endKey: wEnd });
  for (let i = 1; i < cols - 1; i++) {
    wStart = addDays(weeks[i - 1].endKey, 1);
    wEnd = addDays(wStart, 6);
    if (wStart > yearEnd) wStart = yearEnd;
    if (wEnd > yearEnd) wEnd = yearEnd;
    weeks.push({ startKey: wStart, endKey: wEnd });
  }
  const prevEnd = weeks[weeks.length - 1].endKey;
  wStart = addDays(prevEnd, 1);
  if (wStart > yearEnd) wStart = yearEnd;
  wEnd = yearEnd;
  weeks.push({ startKey: wStart, endKey: wEnd });
  return weeks;
}
