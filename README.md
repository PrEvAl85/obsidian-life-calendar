# My Life Calendar

A life-in-weeks view for Obsidian: your whole life as a grid of heart-shaped cells (52 columns = weeks of the year, each row = one year), with a built-in journal, events, and JSON backup (import/export) compatible with the **Life Calendar** Android app.

> Based on the idea of [Life in Weeks](https://waitbutwhy.com/2014/05/life-weeks.html) from WaitButWhy. Visual style matches: lived weeks are red hearts ♥, future weeks are grey ♡, birthday weeks are green, events are hearts in their own color, and weeks that have journal entries get a yellow dot.

## Installation

### From the Community plugins catalog

1. In Obsidian: **Settings → Community plugins → Browse**.
2. Search for **My Life Calendar** and install it.
3. Enable the plugin and turn off **Restricted mode** if prompted.

> Manual installation (if the plugin is not yet visible in the catalog — e.g. while the submission is in review):
>
> 1. Download the latest release or build from source (see below).
> 2. Copy the folder with `main.js`, `manifest.json`, `styles.css` into your vault:
>    `<YourVault>/.obsidian/plugins/my-life-calendar/`
> 3. In Obsidian: **Settings → Community plugins → Reload plugins** (or restart Obsidian), then enable **Life Calendar**.

## First launch (onboarding)

When you enable the plugin for the first time, it asks for your **date of birth** (required — the grid starts from it). After saving, the plugin creates its own folders so they never conflict with your other notes:

- `Life Calendar/Journal/` — daily journal entries, one file per day (`DD.MM.YYYY.md`);
- `Life Calendar/Events.md` — events in YAML-frontmatter (`date`, `color`, `title`);
- `Life Calendar/backup.json` — JSON backup file (import/export).

All paths are configurable in the plugin settings.

## Features

- **Life grid**: hearts for every week from your birth date for the whole lifespan (default 100 years, configurable 50–120).
- **Legend**: birth date, today, age (years + weeks), number of weeks with entries.
- **Tooltips**: hover a heart to see the week's entries. For weeks with entries an interactive tooltip appears with a color palette (8 colors) and ring palette (8 ring colors) — click a swatch to recolor the heart, click again (or the ✕ button) to reset. Settings persist and apply on the fly.
- **Click a week**: opens the week window with that week's journal entries and events. Each entry has **📄 Open note** to open the day's file.
- **➕ Add journal entry**: date + text → appends to the day's file in `Life Calendar/Journal/`.
- **Events**: add / edit / delete (date, title, color) via the Events window or the command palette. Events show as colored hearts on the grid.
- **🎨 Life zones**: mark periods of life (e.g. school, university, career) with a pastel background across the weeks they cover. Open via the **Zones** button in the toolbar or the command palette: add a title, start and end dates, and pick a pastel color. When zones overlap, the more recent zone's color is shown; the tooltip lists all overlapping zones. Zones are stored in settings and included in the backup.
- **📤 Export backup**: builds `Life Calendar/backup.json` in the exact JSON format the Android app's BackupManager imports (`version`, `birthDate`, `lifespanYears`, `entries`, `events`). Import the file into the Android app (Profile → backup) or into another Obsidian vault. Since v1.4.0 zones are exported as an extra `zones` key — the Android app ignores it (`ignoreUnknownKeys`).
- **📥 Import backup**: restores a backup file into this vault — journal entries and events are merged without duplicates. Since v1.4.0 zones from the backup are imported too (duplicates by title + start + end are skipped). Optionally applies the birth date and lifespan from the file (turned on by default when no birth date is set yet). Use it to move your calendar to a new Obsidian account or restore from an Android export.
- **📜 Feed**: the whole journal in one list — the **Feed** toolbar button opens a window with all entries grouped by year, month, and day. Text search, date range filter, "only with images" filter, sort toggle (newest first / oldest first), plus opening the day's note (**📄**), editing, deleting, and reordering entries right from the list.
- **📊 Trackers**: an exercise tracker tab right inside the Life Calendar view — the **📊 Trackers** toolbar button. Month-based heatmap (12 blocks × 7 weekdays), stat cards (total, active days, best streak, best day), month and week summary tables, and day details on click. Data is read from daily notes `daily/DD.MM.YYYY.md` in the format `Exercise: number unit` (e.g. `Push-ups: 25`, `Run: 5 km`). Records are added with the **➕ Add Record** button and saved into the day file.
- **Commands** (Command palette):
  - `My Life Calendar: Open Life Calendar`
  - `My Life Calendar: Add entry to journal`
  - `My Life Calendar: Events (add / edit / delete)`
  - `My Life Calendar: Zones (add / edit / delete)`
  - `My Life Calendar: Export backup (JSON)`
  - `My Life Calendar: Import from backup (JSON)`

## Life Zones (life periods)

Life Zones let you mark periods of life — school, university, work, marriage, etc. — with a continuous pastel band across the weeks they cover, so you can see at a glance which stage of life every week belonged to.

### How to create a zone

1. Open the **Life Calendar** view.
2. Click the **🎨 Zones** button in the toolbar, or run the command `My Life Calendar: Zones (add / edit / delete)`.
3. In the **Zones** window click **➕** (Add).
4. Fill in the form:
   - **Name** — e.g. "University" (required);
   - **Start date** — the day the period began;
   - **End date** — the day the period ended (must not be earlier than the start);
   - **Color** — pick one of the 8 pastel colors from the palette.
5. Click **Save**. The zone is painted on the grid as a solid band that starts at the week containing the start date and ends at the week containing the end date.

### Editing and deleting

- **Edit**: open the Zones window and click the zone row — the edit form opens with the same fields.
- **Delete**: in the Zones window click **🗑** next to the zone.

### How it looks

- The band is a **continuous fill** behind the hearts: no gaps between heart cells or between years.
- The fill is on the **lowest layer** — changing a heart's color or ring never hides the zone behind it.
- **Overlapping zones**: when two zones cover the same weeks, the color of the zone with the **later start date** is shown on top; hovering such a week lists **all** overlapping zones in the tooltip (with their date ranges).
- The zone band is only a visual marker: it does not create notes or events.

### Where zones are stored

Zones are saved in the plugin settings. When you **📤 export** a backup, zones are written to `backup.json` under the `zones` key (color as ARGB, like events). **📥 Import** restores them too — zones that already exist (same name + start + end) are skipped. The Android app ignores the `zones` key, so the file stays compatible.

## 📜 Entry Feed

The Feed is a single chronological list of all journal entries from `Life Calendar/Journal/`. It's handy for browsing the whole history at once, finding an entry by text or images, and editing it without opening files manually.

### How to open

1. Open the **Life Calendar** view.
2. Click the **📜 Feed** button in the toolbar.

### What it can do

- **Grouping**: entries are grouped by year → month → day; each day header shows the date and weekday.
- **Text search**: the search field filters entries by content (wiki links and image captions are included).
- **Date range filter**: the **From** / **To** fields limit the visible range.
- **Only with images**: a checkbox keeps only entries containing `![[images]]`.
- **Sorting**: the ⬇/⬆ toggle switches between newest first and oldest first.
- **Entry actions** (top-right of each card):
  - **📄** — open the day's note (the `DD.MM.YYYY.md` file);
  - **▲ / ▼** — move the entry up/down within the day (reorders blocks in the day file);
  - **✏️** — edit the date and text (wiki links and images are preserved);
  - **🗑** — delete the entry (with confirmation).

Entries are rendered as live Markdown: wiki links are clickable and images are visible right in the list.

## 📊 Exercise Tracker

The exercise tracker tab is built right into the **Life Calendar** view — no extra plugins (Dataview, etc.) needed.

### How to open

1. Open the **Life Calendar** view.
2. Click the **📊 Trackers** button in the toolbar.
3. The **← Back** button returns to the life grid.

### Where the data lives

Records are read from daily notes (default folder `daily/`, files `DD.MM.YYYY.md`). Line format: `Exercise: number unit`, for example:

```
Push-ups: 25
Run: 5 km
Plank: 2 min
```

Recognized units: reps, minutes (min), kilograms (kg), kilometers (km), custom.

### What it can do

- **Heatmap**: 12 month blocks, 7 weekdays each; color intensity — 5 levels based on the day's total. Today is outlined. Click a day to see its records below; the ✕ button closes the details.
- **Stats**: total, active days, best streak (consecutive days), best day.
- **Exercise filter**: a dropdown with "All" plus each exercise.
- **Year**: year switcher (◀ ▶).
- **Tables**: monthly and weekly summaries (days and total value).
- **➕ Add Record**: pick an exercise (or type a custom name), value, unit, date — the record is saved into the day file (an existing line for the same exercise is updated).

### Settings

In the plugin **Settings**, the **Tracker Settings** section:
- **Daily Notes Folder** — where `DD.MM.YYYY.md` files are located;
- **Exercises list** — add (name + default unit), delete, drag-to-reorder.

## Settings

- Birth date
- Lifespan (50–120 years)
- Language: auto (Obsidian language) / Russian / English
- Journal folder, events file, export file paths
- Life zones (add / edit / delete via the Zones window)
- Tracker settings: daily notes folder, exercises list
- Reset heart colors/rings

## Development

Requirements: Node.js ≥ 18.

```
npm install
npm run dev     # watch mode
npm run build   # production build -> main.js
```

## Support the Project

The app is free and without ads, developed in my free time. You can support it by:

- ⭐ starring the repository;
- telling your friends about the project;
- reporting bugs and ideas in Issues.

**Financial support:**

- ☕ **Boosty** — https://boosty.to/pws/donate
- 🍩 **DonationAlerts** — https://www.donationalerts.com/r/photowithoutstudio

**Cryptocurrency:**

- USDT (TRC20): `TRcWS42MhyFRGdGSc6LqTH8CdTy6pLUMn6`
- USDT (BEP20): `0x0905134db34d8d54abf5b60a55406821ed7b8de0`
- BTC: `17hDrZL62DBpTjK6xNCGFFG682jN9PiVF1`
- TON: `UQCzoPJlYLHSoFGmRyh_-_ox1nOMCzx3LwG79xPR5pbjs3Aq`

## Contacts

- **Telegram:** [GraphiCoreOne](https://t.me/GraphiCoreOne) — questions, feedback and ideas.

## License

MIT
