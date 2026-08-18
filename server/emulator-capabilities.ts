export type RoomSystem = "nes" | "ps1" | "psp" | "sega" | "arcade";

export type EmulatorRoomCapability = {
  system: RoomSystem;
  coreName: string;
  maxRoomMembers: number;
  defaultControllerSeats: number;
  maxControllerSeats: number;
  netplay: "retroarch" | "psp-network";
  note: string;
};

/**
 * Every Moudie room has eight active player seats and eight spectator seats.
 * Controller ports remain a property of the selected game/core, so a lobby
 * never promises unsupported simultaneous input ports to a classic title.
 */
export const EMULATOR_ROOM_CAPABILITIES: Record<RoomSystem, EmulatorRoomCapability> = {
  nes: {
    system: "nes",
    coreName: "FCEUmm",
    maxRoomMembers: 16,
    defaultControllerSeats: 2,
    maxControllerSeats: 4,
    netplay: "retroarch",
    note: "تدعم ألعاب NES المعتادة مقعدين؛ الألعاب المتوافقة مع multitap قد تستخدم أربعة مقاعد.",
  },
  ps1: {
    system: "ps1",
    coreName: "PCSX-ReARmed",
    maxRoomMembers: 16,
    defaultControllerSeats: 2,
    maxControllerSeats: 8,
    netplay: "retroarch",
    note: "غرفة PS1 تضم 8 لاعبين و8 مشاهدين. الألعاب المتوافقة مع multitap فقط تستقبل مدخلات اللاعبين الثمانية معاً.",
  },
  psp: {
    system: "psp",
    coreName: "PPSSPP",
    maxRoomMembers: 16,
    defaultControllerSeats: 2,
    maxControllerSeats: 4,
    netplay: "psp-network",
    note: "غرفة PSP تضم 8 لاعبين و8 مشاهدين؛ عدد منافذ التحكم الفعلي يظل تابعاً للعبة ووضعها الشبكي.",
  },
  sega: {
    system: "sega",
    coreName: "Genesis Plus GX",
    maxRoomMembers: 16,
    defaultControllerSeats: 2,
    maxControllerSeats: 4,
    netplay: "retroarch",
    note: "غرفة Sega تضم 8 لاعبين و8 مشاهدين؛ لا تُفتح منافذ التحكم فوق قدرة اللعبة وملحق multitap الفعلي.",
  },
  arcade: {
    system: "arcade",
    coreName: "MAME Arcade",
    maxRoomMembers: 16,
    defaultControllerSeats: 2,
    maxControllerSeats: 4,
    netplay: "retroarch",
    note: "غرفة Arcade تضم 8 لاعبين و8 مشاهدين؛ تحدد لوحة الآركيد عدد منافذ اللعب الفعلية قبل البدء.",
  },
};

export function capabilityFor(system: RoomSystem): EmulatorRoomCapability {
  return EMULATOR_ROOM_CAPABILITIES[system];
}
