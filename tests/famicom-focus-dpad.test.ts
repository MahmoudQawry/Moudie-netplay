import { describe, expect, it } from "vitest";

import { getFocusDpadButtons } from "../lib/famicom-focus-dpad";

describe("Famicom focus D-pad", () => {
  it("keeps each visible arrow bound to its matching emulator direction in Arabic RTL", () => {
    const buttons = getFocusDpadButtons(true, 1);
    expect(buttons.map(({ label, button }) => [label, button])).toEqual([
      ["↑", "UP"], ["←", "LEFT"], ["→", "RIGHT"], ["↓", "DOWN"],
    ]);
    expect(buttons.find((item) => item.button === "LEFT")?.placement).toMatchObject({ right: 0, top: 46 });
    expect(buttons.find((item) => item.button === "RIGHT")?.placement).toMatchObject({ left: 0, top: 46 });
  });

  it("keeps the same physical mapping in left-to-right layouts", () => {
    const buttons = getFocusDpadButtons(false, 1);
    expect(buttons.find((item) => item.button === "LEFT")?.placement).toMatchObject({ left: 0, top: 46 });
    expect(buttons.find((item) => item.button === "RIGHT")?.placement).toMatchObject({ right: 0, top: 46 });
  });
});
