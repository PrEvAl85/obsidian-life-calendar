import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type { SettingDefinitionItem, SettingGroupItem } from "obsidian";
import LifeCalendarPlugin from "./main";
import { DEFAULT_SETTINGS, LIFESPAN_MAX, LIFESPAN_MIN } from "./types";
import { Dict, resolveLanguage, setLanguage, t } from "./i18n";

const SUPPORT_LINKS = [
  { name: "☕ Boosty", url: "https://boosty.to/pws/donate" },
  { name: "🍩 DonationAlerts", url: "https://www.donationalerts.com/r/photowithoutstudio" },
];

const CRYPTO_ADDRESSES: { key: keyof Dict; address: string }[] = [
  { key: "cryptoUSDT", address: "TRcWS42MhyFRGdGSc6LqTH8CdTy6pLUMn6" },
  { key: "cryptoUSDTBEP", address: "0x0905134db34d8d54abf5b60a55406821ed7b8de0" },
  { key: "cryptoBTC", address: "17hDrZL62DBpTjK6xNCGFFG682jN9PiVF1" },
  { key: "cryptoTON", address: "UQCzoPJlYLHSoFGmRyh_-_ox1nOMCzx3LwG79xPR5pbjs3Aq" },
];

const PATH_KEYS = ["journalFolder", "weeklyFolder", "eventsFile", "exportFile"];

export class LifeCalendarSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private plugin: LifeCalendarPlugin,
  ) {
    super(app, plugin);
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    const s = this.plugin.settings;

    const main: SettingGroupItem[] = [
      {
        name: t("settingsLanguage"),
        desc: t("settingsLanguageDesc"),
        control: {
          type: "dropdown",
          key: "language",
          options: { "": t("langAuto"), ru: t("langRu"), en: t("langEn") },
        },
      },
      {
        name: t("settingsBirthDate"),
        desc: t("settingsBirthDateDesc"),
        render: (setting: Setting) => {
          setting.addText((text) => {
            text.inputEl.type = "date";
            text.inputEl.value = s.birthDate;
            text.onChange(async (v) => {
              if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return;
              s.birthDate = v;
              await this.plugin.saveSettings();
              this.plugin.refreshViews();
            });
          });
        },
      },
      {
        name: t("settingsLifespan"),
        desc: t("settingsLifespanDesc", { min: LIFESPAN_MIN, max: LIFESPAN_MAX }),
        control: {
          type: "slider",
          key: "lifespanYears",
          min: LIFESPAN_MIN,
          max: LIFESPAN_MAX,
          step: 1,
        },
      },
      {
        name: t("settingsJournalFolder"),
        desc: t("settingsJournalFolderDesc"),
        control: { type: "text", key: "journalFolder", placeholder: "Life Calendar/Journal" },
      },
      {
        name: t("settingsWeeklyFolder"),
        desc: t("settingsWeeklyFolderDesc"),
        control: { type: "text", key: "weeklyFolder", placeholder: "Life Calendar/Weekly" },
      },
      {
        name: t("settingsEventsFile"),
        desc: t("settingsEventsFileDesc"),
        control: { type: "text", key: "eventsFile", placeholder: "Life Calendar/Events.md" },
      },
      {
        name: t("settingsExportFile"),
        desc: t("settingsExportFileDesc"),
        control: { type: "text", key: "exportFile", placeholder: "Life Calendar/backup.json" },
      },
      {
        name: t("settingsResetCustom"),
        desc: t("settingsResetCustomDesc"),
        action: () => {
          s.custom = {};
          void this.plugin.saveSettings();
          new Notice(t("colorsReset"));
        },
      },
    ];

    const support: SettingGroupItem[] = [
      { name: t("settingsSupport"), desc: t("settingsSupportDesc") },
      ...SUPPORT_LINKS.map<SettingGroupItem>((link) => ({
        name: link.name,
        desc: link.url,
        render: (setting: Setting) => {
          setting.addButton((btn) =>
            btn.setButtonText(t("open")).onClick(() => window.open(link.url, "_blank")),
          );
        },
      })),
      { name: t("supportCrypto") },
      ...CRYPTO_ADDRESSES.map<SettingGroupItem>((c) => ({
        name: t(c.key),
        desc: c.address,
        render: (setting: Setting) => {
          setting.addButton((btn) =>
            btn.setButtonText(t("copy")).onClick(async () => {
              await navigator.clipboard.writeText(c.address);
              new Notice(t("copied", { value: t(c.key) }));
            }),
          );
        },
      })),
    ];

    return [
      { type: "group", heading: "My Life Calendar", items: main },
      { type: "group", heading: t("settingsSupport"), items: support },
    ];
  }

  getControlValue(key: string): unknown {
    return (this.plugin.settings as unknown as Record<string, unknown>)[key];
  }

  setControlValue(key: string, value: unknown): void | Promise<void> {
    const rec = this.plugin.settings as unknown as Record<string, unknown>;
    if (PATH_KEYS.includes(key)) {
      const fallback = DEFAULT_SETTINGS as unknown as Record<string, unknown>;
      rec[key] = String(value).trim() || fallback[key];
    } else {
      rec[key] = value;
    }
    if (key === "language") {
      setLanguage(resolveLanguage(String(value)));
      this.update();
      this.plugin.refreshViews();
    } else if (key === "birthDate" || key === "lifespanYears") {
      this.plugin.refreshViews();
    }
    return this.plugin.saveSettings();
  }
}
