// eslint.config.mjs — правила автоматической проверки Obsidian (eslint-plugin-obsidianmd)
// Конфиг `recommended` совпадает с набором правил ObsidianReviewBot.
import tsparser from "@typescript-eslint/parser";
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
  ...obsidianmd.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: { project: "./tsconfig.json" },
    },
    rules: {
      "obsidianmd/ui/sentence-case": [
        "warn",
        { brands: ["LifeCalendar", "Life Calendar", "My Life Calendar"] },
      ],
    },
  },
  {
    ignores: ["main.js", "styles.css", "manifest.json", "node_modules/", "dist/", "esbuild.config.mjs", "*.txt"],
  },
]);
