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
  nes: { available: true, label: "حفظ واسترجاع محليان متاحان في الوضعين" },
  ps1: { available: true, label: "حفظ واسترجاع محليان متاحان داخل المشغّل" },
  psp: { available: false, label: "سيُفعّل الحفظ والاسترجاع مع دمج مشغّل PSP الفعلي" },
  sega: { available: false, label: "سيُفعّل الحفظ والاسترجاع مع دمج مشغّل Sega الفعلي" },
};
