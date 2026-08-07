import { ItemView, WorkspaceLeaf, moment, Notice } from "obsidian";
import LifeCalendarPlugin from "./main";
import { HEART_COLORS, RING_COLORS, JournalEntry, LifeEvent, WeekStyle } from "./types";
import { keyToDmy, dmyToKey, weekdayName, weekKeyOf } from "./util";
import { AddEntryModal, EventsModal, WeekModal } from "./modals";

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
      container.createEl("div", {
        cls: "lc-no-birthdate",
        text: "Укажите дату рождения в настройках плагина.",
      });
      return;
    }

    const journalStore = this.plugin.journal;
    const eventsStore = this.plugin.events;

    const entries = await journalStore.listAll();
    const events: LifeEvent[] = await eventsStore.read();

    const today = moment().startOf("day");
    const start = moment(s.birthDate, "YYYY-MM-DD").startOf("day");
    if (!start.isValid()) {
      container.createEl("div", { cls: "lc-no-birthdate", text: "Неверная дата рождения." });
      return;
    }

    const yearsLived = today.diff(start, "years");
    const lastBirthday = start.clone().add(yearsLived, "years");
    const weeksSinceLastBirthday = Math.floor(today.diff(lastBirthday, "days") / 7);

    // Недели с записями: weekKey -> записи
    const srcCache = new Map<string, WeekSource>();
    const entryMomentCache = new Map<string, moment.Moment>();
    for (const e of entries) {
      const mk = mondayKeyOf(moment(e.date, "YYYY-MM-DD"));
      let src = srcCache.get(mk);
      if (!src) {
        src = { entries: [] };
        srcCache.set(mk, src);
        entryMomentCache.set(mk, moment(mk, "YYYY-MM-DD").startOf("day"));
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
    const addBtn = tool.createEl("button", { cls: "add-btn", text: "➕ Запись в дневник" });
    addBtn.type = "button";
    const evBtn = tool.createEl("button", { cls: "add-btn", text: "События" });
    evBtn.type = "button";
    const expBtn = tool.createEl("button", { cls: "add-btn", text: "📤 Экспорт для Android" });
    expBtn.type = "button";

    const legend = container.createDiv({ cls: "legend" });
    legend.textContent =
      `Дата рождения: ${start.format("DD.MM.YYYY")}   Сегодня: ${today.format("DD.MM.YYYY")}   ` +
      `Возраст: ${yearsLived} лет и ${weeksSinceLastBirthday} нед.   Записей в неделях: ${srcCache.size}`;

    const grid = container.createDiv({ cls: "life-cal-wrap" }).createDiv({ cls: "life-cal" });
    const startYear = start.year();
    const rows: string[] = [];

    for (let r = 0; r < lifespan; r++) {
      const year = startYear + r;
      const yearWeeks = buildWeeksForYear(year);
      const birthdayThisYear = moment(`${year}-${start.format("MM-DD")}`, "YYYY-MM-DD").startOf("day");
      const ageThisYear = year - start.year();
      let rowHtml = `<div class="row"><span class="age-label">${ageThisYear}</span>`;

      for (let c = 0; c < cols; c++) {
        const weekStart = yearWeeks[c].start.clone().startOf("day");
        const weekEnd = yearWeeks[c].end.clone().endOf("day");

        let cls = "heart empty";
        let ch = emptyChar;
        let colorStyle = "";
        let tooltip = `${weekStart.format("DD.MM.YYYY")}–${weekEnd.format("DD.MM.YYYY")}`;

        if (year === start.year()) {
          if (weekEnd.isBefore(start, "day")) {
            cls = "heart empty";
            ch = emptyChar;
          } else if (weekStart.isSameOrBefore(today, "day")) {
            cls = "heart filled";
            ch = filledChar;
          }
        } else {
          if (weekStart.isSameOrBefore(today, "day")) {
            cls = "heart filled";
            ch = filledChar;
          }
        }

        const isBirthdayWeek =
          birthdayThisYear.isSameOrAfter(weekStart, "day") && birthdayThisYear.isSameOrBefore(weekEnd, "day");

        if (isBirthdayWeek) {
          cls = "heart birthday";
          ch = filledChar;
          tooltip += " — День рождения 🎂";
        }

        if (!isBirthdayWeek) {
          for (const ev of events) {
            const evDate = moment(ev.date, "YYYY-MM-DD").startOf("day");
            if (evDate.isSameOrAfter(weekStart, "day") && evDate.isSameOrBefore(weekEnd, "day")) {
              colorStyle = `style="color:${ev.color}"`;
              tooltip = `${evDate.format("DD.MM.YY")} — ${ev.title}`;
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
            const kd = entryMomentCache.get(k);
            if (kd && kd.isSameOrAfter(weekStart, "day") && kd.isSameOrBefore(weekEnd, "day")) {
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
          if (src.entries.length > 7) tooltip += `\n… ещё ${src.entries.length - 7}`;
        }

        let weekStyle = colorStyle;
        if (src) {
          cls += " js-tip";
          const st: WeekStyle = s.custom[mk] || {};
          if (st.color || st.ring) {
            const parts: string[] = [];
            if (st.color) parts.push("color:" + st.color);
            if (st.ring) parts.push("--lc-ring:" + st.ring);
            weekStyle = 'style="' + parts.join("; ") + '"';
            if (st.ring) cls += " has-ring";
          }
        }
        rowHtml += `<span class="${cls}" ${weekStyle} data-tip="${tooltip.replace(/"/g, "&quot;")}" data-week="${keyToDmy(mk)}"><span class="h-glyph">${ch}</span></span>`;
      }

      rowHtml += `<span class="year-label">${year}</span></div>`;
      rows.push(rowHtml);
    }
    grid.innerHTML = rows.join("");

    this.attachTooltip(grid, srcCache);
    this.attachClicks(grid, addBtn, evBtn, expBtn);
  }

  private attachTooltip(grid: HTMLElement, srcCache: Map<string, WeekSource>): void {
    const container = this.contentEl;
    const wrap = grid.parentElement as HTMLElement;
    const tip = wrap.createDiv({ cls: "lc-tip" });
    let tipTimer: number | null = null;
    let tipKey: string | null = null;

    const hideTip = () => {
      if (tipTimer !== null) {
        window.clearTimeout(tipTimer);
        tipTimer = null;
      }
      tip.style.display = "none";
    };
    const scheduleHideTip = () => {
      if (tipTimer !== null) window.clearTimeout(tipTimer);
      tipTimer = window.setTimeout(() => {
        tip.style.display = "none";
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
      if (!(tipKey === mk && tip.style.display === "block")) {
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
          sw.title = "Цвет сердечка";
          if (st.color === c) sw.classList.add("sel");
        }
        const creset = colorsRow.createEl("button", { cls: "lc-creset" });
        creset.type = "button";
        creset.textContent = "✕";
        creset.title = "Сбросить цвет";
        const main = tip.createDiv({ cls: "lc-tip-main" });
        const textDiv = main.createDiv({ cls: "lc-tip-text" });
        textDiv.textContent = text;
        const rings = main.createDiv({ cls: "lc-tip-rings" });
        for (const r of RING_COLORS) {
          const ring = rings.createDiv({ cls: "lc-ring" });
          ring.style.setProperty("--ring-color", r);
          ring.setAttribute("data-r", r);
          ring.title = "Кольцо";
          if (st.ring === r) ring.classList.add("sel");
        }
        const rreset = rings.createEl("button", { cls: "lc-rreset" });
        rreset.type = "button";
        rreset.textContent = "✕";
        rreset.title = "Сбросить кольцо";
      }
      tip.style.display = "block";
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
      const heart = (e.target as HTMLElement).closest(".heart.js-tip") as HTMLElement | null;
      if (!heart) return;
      if (tipTimer !== null) window.clearTimeout(tipTimer);
      showTip(heart);
    });
    wrap.addEventListener("mouseout", (e) => {
      const heart = (e.target as HTMLElement).closest(".heart.js-tip") as HTMLElement | null;
      if (heart) scheduleHideTip();
    });
    tip.addEventListener("mouseenter", () => {
      if (tipTimer !== null) window.clearTimeout(tipTimer);
    });
    tip.addEventListener("mouseleave", () => scheduleHideTip());

    tip.addEventListener("click", async (e) => {
      const mk = tipKey;
      if (!mk) return;
      const target = e.target as HTMLElement;
      const custom = this.plugin.settings.custom;
      const setStyle = async (patch: Partial<WeekStyle>, clearKey: keyof WeekStyle) => {
        if (!custom[mk]) custom[mk] = {};
        const current = custom[mk] as WeekStyle;
        if (current[clearKey] === patch[clearKey]) delete current[clearKey];
        else Object.assign(current, patch);
        await this.plugin.saveSettings();
        updateHeartStyle(mk);
        updateTipState();
      };
      const sw = target.closest(".lc-csw") as HTMLElement | null;
      if (sw) {
        const c = sw.getAttribute("data-c");
        if (c) await setStyle({ color: c }, "color");
        return;
      }
      const ring = target.closest(".lc-ring") as HTMLElement | null;
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
    });
  }

  private attachClicks(
    grid: HTMLElement,
    addBtn: HTMLElement,
    evBtn: HTMLElement,
    expBtn: HTMLElement,
  ): void {
    const s = this.plugin.settings;
    const today = moment().startOf("day").format("YYYY-MM-DD");

    addBtn.addEventListener("click", () => {
      new AddEntryModal(this.app, today, async (date, text) => {
        const path = await this.plugin.journal.addEntry(date, text);
        new Notice("Запись добавлена: " + path);
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

    expBtn.addEventListener("click", async () => {
      try {
        const entries = await this.plugin.journal.listAll();
        const events = await this.plugin.events.read();
        const json = this.plugin.export.buildJson(entries, events);
        const path = await this.plugin.export.writeBackup(json);
        new Notice(
          `Экспорт готов: ${path}\nЗаписей: ${entries.length}, событий: ${events.length}. ` +
            "Импортируйте файл в приложение Life Calendar (Android).",
          6000,
        );
      } catch (err) {
        console.error("Life Calendar: export", err);
        new Notice("Life Calendar: ошибка экспорта: " + (err && err.message ? err.message : err));
      }
    });

    grid.addEventListener("click", (evt) => {
      const heart = (evt.target as HTMLElement).closest(".heart") as HTMLElement | null;
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
        },
      ).open();
    });
  }
}

function mondayKeyOf(mom: moment.Moment): string {
  const wd = (mom.day() + 6) % 7; // 0 = понедельник
  return mom.clone().subtract(wd, "days").format("YYYY-MM-DD");
}

interface WeekRange {
  start: moment.Moment;
  end: moment.Moment;
}

function buildWeeksForYear(year: number, cols = 52): WeekRange[] {
  const yearStart = moment(`${year}-01-01`, "YYYY-MM-DD").startOf("day");
  const yearEnd = moment(`${year}-12-31`, "YYYY-MM-DD").endOf("day");
  const weeks: WeekRange[] = [];
  let wStart = yearStart.clone().startOf("day");
  let wEnd = wStart.clone().endOf("isoWeek").endOf("day");
  if (wEnd.isAfter(yearEnd)) wEnd = yearEnd.clone();
  weeks.push({ start: wStart.clone().startOf("day"), end: wEnd.clone().endOf("day") });
  for (let i = 1; i < cols - 1; i++) {
    wStart = weeks[i - 1].end.clone().add(1, "day").startOf("day");
    wEnd = wStart.clone().add(6, "day").endOf("day");
    if (wStart.isAfter(yearEnd)) wStart = yearEnd.clone().startOf("day");
    if (wEnd.isAfter(yearEnd)) wEnd = yearEnd.clone();
    weeks.push({ start: wStart.clone().startOf("day"), end: wEnd.clone().endOf("day") });
  }
  const prevEnd = weeks[weeks.length - 1].end.clone();
  wStart = prevEnd.clone().add(1, "day").startOf("day");
  if (wStart.isAfter(yearEnd)) wStart = yearEnd.clone().startOf("day");
  wEnd = yearEnd.clone().endOf("day");
  weeks.push({ start: wStart.clone().startOf("day"), end: wEnd.clone().endOf("day") });
  return weeks;
}
