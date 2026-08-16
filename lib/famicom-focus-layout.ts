/**
 * React Native swaps `left` and `right` automatically on Arabic RTL devices.
 * These placements intentionally use the opposite logical edge in RTL so the
 * controls remain at their physical console positions: D-pad left, A/B right.
 */
export function getFocusControlPlacement(isRtl: boolean) {
  return isRtl
    ? { dpad: { right: 0 }, actions: { left: 0 } }
    : { dpad: { left: 0 }, actions: { right: 0 } };
}
