export type NetplayButton = "UP" | "DOWN" | "LEFT" | "RIGHT" | "A" | "B" | "START" | "SELECT";
export type NetplayRole = "host" | "player";
export type NetplayPlayerSeat = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

const allowedButtons = new Set<NetplayButton>(["UP", "DOWN", "LEFT", "RIGHT", "A", "B", "START", "SELECT"]);
const isPlayerSeat = (value: unknown): value is NetplayPlayerSeat => typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 8;

export function normalizeNetplayInput(
  role: NetplayRole,
  payload: { button?: unknown; isDown?: unknown; frame?: unknown; player?: unknown },
  assignedPlayer?: NetplayPlayerSeat,
) {
  const button = typeof payload.button === "string" ? payload.button : "";
  if (!allowedButtons.has(button as NetplayButton) || typeof payload.isDown !== "boolean") return null;
  const frame = typeof payload.frame === "number" && Number.isFinite(payload.frame) ? Math.max(0, Math.floor(payload.frame)) : 0;
  const requestedPlayer = isPlayerSeat(payload.player) ? payload.player : undefined;
  const player = assignedPlayer ?? requestedPlayer ?? (role === "host" ? 1 : 2);
  if (!isPlayerSeat(player)) return null;
  return { player, button: button as NetplayButton, isDown: payload.isDown, frame };
}
