export type EmulatorSystemId = "nes" | "ps1" | "psp" | "sega";

export type SaveStateCapability = {
  available: boolean;
  label: string;
};

/**
 * Single source of truth for local state save/load. A game state can only be
 * produced by an installed emulator core, so Sega/PSP stay explicit until
 * their real players are integrated.
 */
export const SAVE_STATE_CAPABILITIES: Record<EmulatorSystemId, SaveStateCapability> = {
  nes: { available: true, label: "Local save and load are available in both modes" },
  ps1: { available: true, label: "Local save and load are available inside the player" },
  psp: { available: false, label: "Save and load activate with the native PSP player" },
  sega: { available: false, label: "Save and load activate with the native Sega player" },
};
