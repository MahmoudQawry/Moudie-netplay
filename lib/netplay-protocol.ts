export type NetplayButton = "UP" | "DOWN" | "LEFT" | "RIGHT" | "A" | "B" | "START" | "SELECT";
export type NetplayRole = "host" | "player";

const allowedButtons = new Set<NetplayButton>(["UP", "DOWN", "LEFT", "RIGHT", "A", "B", "START", "SELECT"]);

export function normalizeNetplayInput(role: NetplayRole, payload: { button?: unknown; isDown?: unknown; frame?: unknown }) {
  const button = typeof payload.button === "string" ? payload.button : "";
  if (!allowedButtons.has(button as NetplayButton) || typeof payload.isDown !== "boolean") return null;
  const frame = typeof payload.frame === "number" && Number.isFinite(payload.frame) ? Math.max(0, Math.floor(payload.frame)) : 0;
  return { player: role === "host" ? 1 : 2, button: button as NetplayButton, isDown: payload.isDown, frame };
}
