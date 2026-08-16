import { describe, expect, it } from "vitest";

import { FamicomInputCoordinator } from "../lib/famicom-input-coordinator";

type Button = "LEFT" | "RIGHT" | "UP" | "DOWN" | "A" | "B" | "START" | "SELECT";

function coordinator() {
  return new FamicomInputCoordinator<Button>(
    new Set<Button>(["LEFT", "RIGHT", "UP", "DOWN"]),
    new Set<Button>(["A", "B"]),
  );
}

describe("FamicomInputCoordinator", () => {
  it("keeps walking active when a second finger presses jump", () => {
    const input = coordinator();
    expect(input.transition("RIGHT", true)).toEqual([{ button: "RIGHT", isDown: true }]);

    // Android may emit this release before the action Pressable becomes responder.
    expect(input.transition("RIGHT", false)).toEqual([]);
    expect(input.transition("A", true)).toEqual([{ button: "A", isDown: true }]);
    expect(input.flushPendingDirections()).toEqual([]);
    expect(input.transition("A", false)).toEqual([
      { button: "A", isDown: false },
      { button: "RIGHT", isDown: false },
    ]);
  });

  it("releases an individual button immediately when no action button is held", () => {
    const input = coordinator();
    expect(input.transition("LEFT", true)).toEqual([{ button: "LEFT", isDown: true }]);
    expect(input.transition("LEFT", false)).toEqual([]);
    expect(input.flushPendingDirections()).toEqual([{ button: "LEFT", isDown: false }]);
  });
});
