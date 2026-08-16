export const FAMICOM_CORE_VERSION = "jsnes-2.1.0-web";

export type FamicomMessage =
  | { type: "rom"; fingerprint: string; coreVersion: string }
  | { type: "state"; snapshot: string; syncId: number }
  | { type: "input"; player: 1 | 2; button: string; isDown: boolean };

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
    return { type: "input", player: message.player, button: message.button, isDown: message.isDown };
  }
  return null;
}

export async function fingerprintRom(romData: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", romData);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}
