import { describe, expect, it } from "vitest";

import { getFamicomFocusButtonAt } from "../lib/famicom-focus-touch";
import { getFamicomPixelPerfectCanvasSize } from "../lib/famicom-pixel-scale";

describe("Famicom focus multi-touch hit areas", () => {
  it("keeps the D-pad on the physical left and A/B on the physical right", () => {
    expect(getFamicomFocusButtonAt(30, 70, 340, 1)).toBe("LEFT");
    expect(getFamicomFocusButtonAt(315, 56, 340, 1)).toBe("A");
  });

  it("uses an integer physical scale for crisp 256×240 Famicom pixels", () => {
    expect(getFamicomPixelPerfectCanvasSize(1080, 960, 3)).toEqual({ scale: 4, cssWidth: 1024 / 3, cssHeight: 320 });
  });
});
