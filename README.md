# My Life Calendar

A life-in-weeks view for Obsidian: your whole life as a grid of heart-shaped cells (52 columns = weeks of the year, each row = one year), with a built-in journal, events, and one-click export for the **Life Calendar** Android app.

> Inspired by the "Life in Weeks" idea (WaitButWhy). Visual style matches the Life Calendar Android app: lived weeks are red hearts ♥, future weeks are grey ♡, birthday weeks are green, events are hearts in their own color, and weeks that have journal entries get a yellow dot.

## Installation

### From the Community plugins catalog

1. In Obsidian: **Settings → Community plugins → Browse**.
2. Search for **Life Calendar** and install it.
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
- `Life Calendar/Weekly/` — weekly aggregator notes (built when you click a week);
- `Life Calendar/Events.md` — events in YAML-frontmatter (`date`, `color`, `title`);
- `Life Calendar/backup.json` — export file for the Android app.

All paths are configurable in the plugin settings.

## Features

- **Life grid**: hearts for every week from your birth date for the whole lifespan (default 100 years, configurable 50–120).
- **Legend**: birth date, today, age (years + weeks), number of weeks with entries.
- **Tooltips**: hover a heart to see the week's entries. For weeks with entries an interactive tooltip appears with a color palette (8 colors) and ring palette (8 ring colors) — click a swatch to recolor the heart, click again (or the ✕ button) to reset. Settings persist and apply on the fly.
- **Click a week**: opens (or creates) the weekly aggregator note built from that week's journal files. Manual sections you added are preserved when the note is rebuilt.
- **➕ Add journal entry**: date + text → appends to the day's file in `Life Calendar/Journal/`.
- **Events**: add / edit / delete (date, title, color) via the Events window or the command palette. Events show as colored hearts on the grid.
- **📤 Export for Life Calendar Android**: builds `Life Calendar/backup.json` in the exact JSON format the Android app's BackupManager imports (`version`, `birthDate`, `lifespanYears`, `entries`, `events`). Then import the file in the Android app (Profile → backup).
- **Commands** (Command palette):
  - `My Life Calendar: Open Life Calendar`
  - `My Life Calendar: Add entry to journal`
  - `My Life Calendar: Events (add / edit / delete)`
  - `My Life Calendar: Export for Life Calendar Android`

## Settings

- Birth date
- Lifespan (50–120 years)
- Language: auto (Obsidian language) / Russian / English
- Journal folder, weekly folder, events file, export file paths
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

## License

MIT
