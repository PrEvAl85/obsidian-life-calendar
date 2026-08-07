import { App, TFile } from "obsidian";
import { LifeCalendarSettings, LifeEvent } from "./types";

/**
 * Хранилище событий. Файл с YAML-frontmatter:
 *
 * ---
 * events:
 *   - date: "2010-06-19"
 *     color: "#ff69b4"
 *     title: "Наша свадьба"
 * ---
 */
export class EventsStore {
  constructor(
    private app: App,
    private getSettings: () => LifeCalendarSettings,
  ) {}

  get path(): string {
    return this.getSettings().eventsFile;
  }

  async read(): Promise<LifeEvent[]> {
    const file = this.app.vault.getAbstractFileByPath(this.path) as TFile | null;
    if (!file) return [];
    const content = await this.app.vault.read(file);
    return parseEventsYaml(content);
  }

  async write(events: LifeEvent[]): Promise<void> {
    const yaml = events
      .map((e) => `  - date: "${e.date}"\n    color: "${e.color}"\n    title: "${escapeTitle(e.title)}"`)
      .join("\n");
    const content = `---\nevents:\n${yaml}\n---\n\n`;
    const file = this.app.vault.getAbstractFileByPath(this.path) as TFile | null;
    if (file) {
      await this.app.vault.modify(file, content);
    } else {
      await this.ensureFolder(this.path);
      await this.app.vault.create(this.path, content);
    }
  }

  async add(event: LifeEvent): Promise<void> {
    const events = await this.read();
    events.push(event);
    events.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
    await this.write(events);
  }

  async remove(date: string, title: string): Promise<void> {
    const events = await this.read();
    const next = events.filter((e) => !(e.date === date && e.title === title));
    await this.write(next);
  }

  async update(oldEvent: LifeEvent, next: LifeEvent): Promise<void> {
    const events = await this.read();
    const idx = events.findIndex((e) => e.date === oldEvent.date && e.title === oldEvent.title);
    if (idx === -1) return;
    events[idx] = next;
    events.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
    await this.write(events);
  }

  async ensureFolder(filePath: string): Promise<void> {
    const dir = filePath.replace(/[^/]+$/, "").replace(/\/$/, "");
    if (!dir) return;
    const folder = this.app.vault.getAbstractFileByPath(dir);
    if (!folder) {
      try {
        await this.app.vault.createFolder(dir);
      } catch {
        // Папка могла создаться параллельно
      }
    }
  }
}

function escapeTitle(title: string): string {
  return title.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function parseEventsYaml(content: string): LifeEvent[] {
  const m = /^---\s*\n([\s\S]*?)\n---\s*\n?/.exec(content);
  if (!m) return [];
  const block = m[1];
  const out: LifeEvent[] = [];
  let current: Partial<LifeEvent> | null = null;
  const push = () => {
    if (current && current.date && current.title) {
      out.push({ date: current.date, color: current.color || "#d22", title: current.title });
    }
    current = null;
  };
  for (const line of block.split(/\r?\n/)) {
    const item = /^\s*-\s*date:\s*"?([\d-]+)"?\s*$/.exec(line);
    if (item) {
      push();
      current = { date: item[1] };
      continue;
    }
    if (!current) continue;
    const color = /^\s*color:\s*"?([#\dA-Fa-f]+)"?\s*$/.exec(line);
    if (color) {
      current.color = color[1];
      continue;
    }
    const title = /^\s*title:\s*(.+?)\s*$/.exec(line);
    if (title) {
      current.title = unquote(title[1]);
    }
  }
  push();
  return out;
}

function unquote(s: string): string {
  let t = s.trim();
  if (t.startsWith('"') && t.endsWith('"')) t = t.slice(1, -1);
  return t.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
}
