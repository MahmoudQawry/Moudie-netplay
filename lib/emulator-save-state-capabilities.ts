export type EmulatorSystemId = "nes" | "ps1" | "psp" | "sega" | "arcade";

export type SaveStateCapability = {
  available: boolean;
  label: string;
};

/**
 * Single source of truth for local state save/load. The UI can only advertise
 * capabilities that are backed by the installed emulator core.
 */
export const SAVE_STATE_CAPABILITIES: Record<EmulatorSystemId, SaveStateCapability> = {
  nes: { available: true, label: "Local save and load are available in both modes" },
  ps1: { available: true, label: "Local save and load are available inside the player" },
  psp: { available: true, label: "Local save and load are available with the native PSP player" },
  sega: { available: true, label: "Local save and load are available with the native Sega player" },
  arcade: { available: true, label: "Local save and load are available with the native Arcade player" },
};
