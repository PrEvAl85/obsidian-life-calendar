import { ItemView, WorkspaceLeaf, TFile, Notice } from "obsidian";
import LifeCalendarPlugin from "./main";
import { HEART_COLORS, RING_COLORS, JournalEntry, LifeEvent, WeekStyle } from "./types";
import { keyToDmy, dmyToKey, weekdayName, weekKeyOf } from "./util";
import { addDays, addYears, diffDays, diffYears, formatKey, isValidKey, mondayKeyOf, monthDayOf, todayKey, yearOf } from "./date";
import { AddEntryModal, EventsModal, ImportModal, WeekModal } from "./modals";
import { t } from "./i18n";

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
    const expBtn = tool.createEl("button", { cls: "add-btn", text: t("exportBtn") });
    expBtn.type = "button";
    const impBtn = tool.createEl("button", { cls: "add-btn", text: t("importBtn") });
    impBtn.type = "button";

    const legend = container.createDiv({ cls: "legend" });
    legend.textContent = t("legend", {
      birth: formatKey(start),
      today: formatKey(today),
      age: yearsLived,
      weeks: weeksSinceLastBirthday,
      weeksWith: srcCache.size,
    });

    const grid = container.createDiv({ cls: "life-cal-wrap" }).createDiv({ cls: "life-cal" });
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
        if (ringColor) cell.style.setProperty("--lc-ring", ringColor);
        cell.createSpan({ cls: "h-glyph", text: ch });
      }

      row.createSpan({ cls: "year-label", text: String(year) });
    }

    this.attachTooltip(grid, srcCache);
    this.attachClicks(grid, addBtn, evBtn, expBtn, impBtn);
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
    expBtn: HTMLElement,
    impBtn: HTMLElement,
  ): void {
    const today = todayKey();

    addBtn.addEventListener("click", () => {
      new AddEntryModal(this.app, today, async (date, text) => {
        const path = await this.plugin.journal.addEntry(date, text);
        new Notice(t("entryAdded", { path }));
        await this.render();
      }).open();
    });

    evBtn.addEventListener("click", () => {
      new EventsModal(
        this.app,
        () => this.plugin.events.read(),
        async (events) => this.plugin.events.write(events),
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
          openDayNotes: async (paths) => {
            for (const p of paths) {
              const f = this.app.vault.getAbstractFileByPath(p) as TFile | null;
              if (f) await this.app.workspace.getLeaf(true).openFile(f);
            }
          },
          openWeekNote: async (entries) => {
            const file = await this.plugin.week.getOrCreateWeek(mk, entries);
            if (file) {
              await this.app.workspace.getLeaf(false).openFile(file);
            } else {
              new Notice(t("weekNoEntries"));
            }
          },
        },
      ).open();
    });
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
