import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const emulatorScreens = [
  "app/famicom/[roomId].tsx",
  "app/ps1/[roomId].tsx",
  "app/psp/[roomId].tsx",
  "app/native/[system]/[roomId].tsx",
];

describe("emulator localization guard", () => {
  it("does not allow literal user-facing Alert or Error messages", () => {
    const violations: string[] = [];
    for (const relativePath of emulatorScreens) {
      const source = readFileSync(resolve(process.cwd(), relativePath), "utf8");
      const lines = source.split(/\r?\n/);
      lines.forEach((line, index) => {
        if (/Alert\.alert\(\s*["'`]/.test(line) || /throw new Error\(\s*["'`]/.test(line)) {
          violations.push(`${relativePath}:${index + 1}`);
        }
      });
    }
    expect(violations, `Use t("key") for emulator-facing errors: ${violations.join(", ")}`).toEqual([]);
  });

  it("keeps the three required language dictionaries aligned", () => {
    const source = readFileSync(resolve(process.cwd(), "lib/language.tsx"), "utf8");
    const keysByLocale = ["en", "ar", "fr"].map((locale) => {
      const block = source.match(new RegExp(`\\n  ${locale}: \\{([\\s\\S]*?)\\},\\n`))?.[1] ?? "";
      return new Set([...block.matchAll(/([A-Za-z][A-Za-z0-9]*):/g)].map((match) => match[1]));
    });
    expect(keysByLocale[0].size).toBeGreaterThan(0);
    expect([...keysByLocale[0]].filter((key) => !keysByLocale[1].has(key) || !keysByLocale[2].has(key))).toEqual([]);
  });
});
