export type FamicomFocusButton = "UP" | "DOWN" | "LEFT" | "RIGHT" | "A" | "B";

export type FocusTouchBox = {
  button: FamicomFocusButton;
  left: number;
  top: number;
  width: number;
  height: number;
};

/** Physical hit areas for the focus controls, independent of Arabic RTL layout mirroring. */
export function getFamicomFocusTouchBoxes(surfaceWidth: number, scale: number): FocusTouchBox[] {
  const size = 54 * scale;
  const step = 46 * scale;
  const gridSize = 138 * scale;
  const actionGap = 10;
  const actionLeft = Math.max(0, surfaceWidth - (size * 2 + actionGap));
  const actionTop = 29;

  return [
    { button: "UP", left: step, top: 0, width: size, height: size },
    { button: "LEFT", left: 0, top: step, width: size, height: size },
    { button: "RIGHT", left: gridSize - size, top: step, width: size, height: size },
    { button: "DOWN", left: step, top: gridSize - size, width: size, height: size },
    { button: "B", left: actionLeft, top: actionTop, width: size, height: size },
    { button: "A", left: actionLeft + size + actionGap, top: actionTop, width: size, height: size },
  ];
}

export function getFamicomFocusButtonAt(x: number, y: number, surfaceWidth: number, scale: number): FamicomFocusButton | null {
  return getFamicomFocusTouchBoxes(surfaceWidth, scale).find((box) => (
    x >= box.left && x <= box.left + box.width && y >= box.top && y <= box.top + box.height
  ))?.button ?? null;
}
