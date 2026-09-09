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
    // Keys are four-space-indented entries; anchoring at line start avoids false
    // captures from colons inside translated values (e.g. "Pressed:").
    const keysByLocale = ["en", "ar", "fr"].map((locale) => {
      const block = source.match(new RegExp(`\\n  ${locale}: \\{([\\s\\S]*?)\\n  \\},`))?.[1] ?? "";
      return new Set([...block.matchAll(/^ {4}([A-Za-z][A-Za-z0-9]*):/gm)].map((match) => match[1]));
    });
    expect(keysByLocale[0].size).toBeGreaterThan(0);
    expect([...keysByLocale[0]].filter((key) => !keysByLocale[1].has(key) || !keysByLocale[2].has(key))).toEqual([]);
  });

  it("keeps every dictionary value non-empty in the three languages", () => {
    const source = readFileSync(resolve(process.cwd(), "lib/language.tsx"), "utf8");
    for (const locale of ["en", "ar", "fr"]) {
      const block = source.match(new RegExp(`\\n  ${locale}: \\{([\\s\\S]*?)\\n  \\},`))?.[1] ?? "";
      const emptyKeys = [...block.matchAll(/^ {4}([A-Za-z][A-Za-z0-9]*): "([^"]*)",?$/gm)]
        .filter((match) => match[2].trim().length === 0)
        .map((match) => match[1]);
      expect(emptyKeys, `${locale} has empty values: ${emptyKeys.join(", ")}`).toEqual([]);
    }
  });
});
