export type EmulatorSystemId = "nes" | "ps1" | "psp" | "sega" | "arcade";

export type SaveStateCapability = {
  available: boolean;
  label: string;
  slots: number;
};

/**
 * Single source of truth for local state save/load. The UI can only advertise
 * capabilities that are backed by the installed emulator core.
 */
export const SAVE_STATE_CAPABILITIES: Record<EmulatorSystemId, SaveStateCapability> = {
  nes: { available: true, slots: 5, label: "Five local save slots are available inside the player" },
  ps1: { available: true, slots: 5, label: "Five local save slots are available inside the player" },
  psp: { available: true, slots: 5, label: "Five local save slots are available inside the player" },
  sega: { available: true, slots: 5, label: "Five local save slots are available inside the player" },
  arcade: { available: true, slots: 5, label: "Five local save slots are available inside the player" },
};
