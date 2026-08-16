import { describe, expect, it } from "vitest";

import { getFocusControlPlacement } from "../lib/famicom-focus-layout";

describe("Famicom focus control placement", () => {
  it("keeps the D-pad physically on the left and A/B on the right in LTR", () => {
    expect(getFocusControlPlacement(false)).toEqual({ dpad: { left: 0 }, actions: { right: 0 } });
  });

  it("compensates for React Native RTL edge swapping on Arabic devices", () => {
    expect(getFocusControlPlacement(true)).toEqual({ dpad: { right: 0 }, actions: { left: 0 } });
  });
});
