export type FocusDpadButton = {
  label: "↑" | "↓" | "←" | "→";
  button: "UP" | "DOWN" | "LEFT" | "RIGHT";
  placement: { left?: number; right?: number; top?: number; bottom?: number };
};

/**
 * React Native mirrors absolute `left`/`right` offsets in Arabic RTL layouts.
 * These placements are deliberately compensated so physical screen positions
 * stay constant: LEFT is on the left, RIGHT is on the right, UP is above,
 * and DOWN is below on every device language.
 */
export function getFocusDpadButtons(isRtl: boolean, scale: number): FocusDpadButton[] {
  const center = 46 * scale;
  return [
    { label: "↑", button: "UP", placement: { left: center, top: 0 } },
    { label: "←", button: "LEFT", placement: isRtl ? { right: 0, top: center } : { left: 0, top: center } },
    { label: "→", button: "RIGHT", placement: isRtl ? { left: 0, top: center } : { right: 0, top: center } },
    { label: "↓", button: "DOWN", placement: { left: center, bottom: 0 } },
  ];
}
