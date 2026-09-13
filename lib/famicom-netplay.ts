export const FAMICOM_CORE_VERSION = "jsnes-2.1.0-web-adaptive";

export type FamicomMessage =
  | { type: "rom"; fingerprint: string; coreVersion: string }
  | { type: "state"; snapshot: string; syncId: number }
  | { type: "input"; player: 1 | 2; button: string; isDown: boolean; frame?: number; mask?: number }
  | { type: "quality-probe"; sequence: number; timestamp: number }
  | { type: "quality-pong"; sequence: number; timestamp: number }
  | { type: "frame-sync"; frame: number; timestamp: number };

export function peerIdForRoom(roomId: number): string {
  return `moudie-famicom-room-${roomId}`;
}

export function isNesFile(name: string): boolean {
  return name.trim().toLowerCase().endsWith(".nes");
}

export function decodeFamicomMessage(value: unknown): FamicomMessage | null {
  if (!value || typeof value !== "object" || !("type" in value)) return null;
  const message = value as Record<string, unknown>;
  if (message.type === "rom" && typeof message.fingerprint === "string" && typeof message.coreVersion === "string") {
    return { type: "rom", fingerprint: message.fingerprint, coreVersion: message.coreVersion };
  }
  if (message.type === "state" && typeof message.snapshot === "string" && Number.isSafeInteger(message.syncId) && Number(message.syncId) >= 0) {
    return { type: "state", snapshot: message.snapshot, syncId: Number(message.syncId) };
  }
  if (
    message.type === "input" &&
    (message.player === 1 || message.player === 2) &&
    typeof message.button === "string" &&
    typeof message.isDown === "boolean"
  ) {
    return { 
      type: "input", 
      player: message.player, 
      button: message.button, 
      isDown: message.isDown,
      frame: typeof message.frame === "number" ? message.frame : undefined,
      mask: typeof message.mask === "number" ? message.mask : undefined,
    };
  }
  if (message.type === "quality-probe" && typeof message.sequence === "number" && typeof message.timestamp === "number") {
    return { type: "quality-probe", sequence: message.sequence, timestamp: message.timestamp };
  }
  if (message.type === "quality-pong" && typeof message.sequence === "number" && typeof message.timestamp === "number") {
    return { type: "quality-pong", sequence: message.sequence, timestamp: message.timestamp };
  }
  if (message.type === "frame-sync" && typeof message.frame === "number" && typeof message.timestamp === "number") {
    return { type: "frame-sync", frame: message.frame, timestamp: message.timestamp };
  }
  return null;
}

export async function fingerprintRom(romData: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", romData);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

// adaptive button mask mapping for Famicom (NES)
export const FAMICOM_BUTTON_MASKS: Record<string, number> = {
  UP: 1 << 0,
  DOWN: 1 << 1,
  LEFT: 1 << 2,
  RIGHT: 1 << 3,
  A: 1 << 4,
  B: 1 << 5,
  SELECT: 1 << 6,
  START: 1 << 7,
};

export function buttonToMask(button: string): number {
  return FAMICOM_BUTTON_MASKS[button.toUpperCase()] ?? 0;
}

export function maskToButtons(mask: number): string[] {
  const buttons: string[] = [];
  for (const [name, bit] of Object.entries(FAMICOM_BUTTON_MASKS)) {
    if (mask & bit) buttons.push(name);
  }
  return buttons;
}
