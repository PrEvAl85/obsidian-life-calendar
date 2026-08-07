import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import LifeCalendarPlugin from "./main";
import { LIFESPAN_MAX, LIFESPAN_MIN } from "./types";
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

export class LifeCalendarSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private plugin: LifeCalendarPlugin,
  ) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Life Calendar" });

    // --- Локализация
    containerEl.createEl("h3", { text: t("settingsLanguage") });
    new Setting(containerEl)
      .setName(t("settingsLanguage"))
      .setDesc(t("settingsLanguageDesc"))
      .addDropdown((dd) => {
        dd.addOption("", t("langAuto"));
        dd.addOption("ru", t("langRu"));
        dd.addOption("en", t("langEn"));
        dd.setValue(this.plugin.settings.language);
        dd.onChange(async (v) => {
          this.plugin.settings.language = v;
          await this.plugin.saveSettings();
          setLanguage(resolveLanguage(v));
          this.display();
          this.plugin.refreshViews();
        });
      });

    // --- Основные
    new Setting(containerEl)
      .setName(t("settingsBirthDate"))
      .setDesc(t("settingsBirthDateDesc"))
      .addText((text) => {
        text.inputEl.type = "date";
        text.inputEl.value = this.plugin.settings.birthDate;
        text.onChange(async (v) => {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return;
          this.plugin.settings.birthDate = v;
          await this.plugin.saveSettings();
          this.plugin.refreshViews();
        });
      });

    new Setting(containerEl)
      .setName(t("settingsLifespan"))
      .setDesc(t("settingsLifespanDesc", { min: LIFESPAN_MIN, max: LIFESPAN_MAX }))
      .addSlider((slider) => {
        slider
          .setLimits(LIFESPAN_MIN, LIFESPAN_MAX, 1)
          .setValue(this.plugin.settings.lifespanYears)
          .setDynamicTooltip()
          .onChange(async (v) => {
            this.plugin.settings.lifespanYears = v;
            await this.plugin.saveSettings();
            this.plugin.refreshViews();
          });
      });

    new Setting(containerEl)
      .setName(t("settingsJournalFolder"))
      .setDesc(t("settingsJournalFolderDesc"))
      .addText((text) =>
        text
          .setPlaceholder("Life Calendar/Journal")
          .setValue(this.plugin.settings.journalFolder)
          .onChange(async (v) => {
            this.plugin.settings.journalFolder = v.trim() || "Life Calendar/Journal";
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName(t("settingsWeeklyFolder"))
      .setDesc(t("settingsWeeklyFolderDesc"))
      .addText((text) =>
        text
          .setPlaceholder("Life Calendar/Weekly")
          .setValue(this.plugin.settings.weeklyFolder)
          .onChange(async (v) => {
            this.plugin.settings.weeklyFolder = v.trim() || "Life Calendar/Weekly";
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName(t("settingsEventsFile"))
      .setDesc(t("settingsEventsFileDesc"))
      .addText((text) =>
        text
          .setPlaceholder("Life Calendar/Events.md")
          .setValue(this.plugin.settings.eventsFile)
          .onChange(async (v) => {
            this.plugin.settings.eventsFile = v.trim() || "Life Calendar/Events.md";
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName(t("settingsExportFile"))
      .setDesc(t("settingsExportFileDesc"))
      .addText((text) =>
        text
          .setPlaceholder("Life Calendar/backup.json")
          .setValue(this.plugin.settings.exportFile)
          .onChange(async (v) => {
            this.plugin.settings.exportFile = v.trim() || "Life Calendar/backup.json";
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName(t("settingsResetCustom"))
      .setDesc(t("settingsResetCustomDesc"))
      .addButton((btn) =>
        btn.setButtonText(t("reset")).onClick(async () => {
          this.plugin.settings.custom = {};
          await this.plugin.saveSettings();
          new Notice(t("colorsReset"));
        }),
      );

    // --- Поддержать проект
    containerEl.createEl("h3", { text: t("settingsSupport") });
    containerEl.createEl("p", { cls: "lc-support-desc", text: t("settingsSupportDesc") });
    for (const link of SUPPORT_LINKS) {
      new Setting(containerEl)
        .setName(link.name)
        .setDesc(link.url)
        .addButton((btn) =>
          btn.setButtonText(t("open")).onClick(() => window.open(link.url, "_blank")),
        );
    }
    containerEl.createEl("h4", { text: t("supportCrypto") });
    for (const c of CRYPTO_ADDRESSES) {
      new Setting(containerEl)
        .setName(t(c.key))
        .setDesc(c.address)
        .addButton((btn) =>
          btn.setButtonText(t("copy")).onClick(async () => {
            await navigator.clipboard.writeText(c.address);
            new Notice(t("copied", { value: t(c.key) }));
          }),
        );
    }
  }
}
