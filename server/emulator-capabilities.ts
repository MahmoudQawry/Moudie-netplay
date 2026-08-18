export type RoomSystem = "nes" | "ps1" | "psp" | "sega" | "arcade";

export type EmulatorRoomCapability = {
  system: RoomSystem;
  coreName: string;
  maxRoomMembers: 10;
  defaultControllerSeats: number;
  maxControllerSeats: number;
  netplay: "retroarch" | "psp-network";
  note: string;
};

/**
 * A Moudie room may always contain ten named users. Controller seats remain a
 * property of the selected game/core, so the lobby never promises impossible
 * input ports to a classic title.
 */
export const EMULATOR_ROOM_CAPABILITIES: Record<RoomSystem, EmulatorRoomCapability> = {
  nes: {
    system: "nes",
    coreName: "FCEUmm",
    maxRoomMembers: 10,
    defaultControllerSeats: 2,
    maxControllerSeats: 4,
    netplay: "retroarch",
    note: "تدعم ألعاب NES المعتادة مقعدين؛ الألعاب المتوافقة مع multitap قد تستخدم أربعة مقاعد.",
  },
  ps1: {
    system: "ps1",
    coreName: "PCSX-ReARmed",
    maxRoomMembers: 10,
    defaultControllerSeats: 2,
    maxControllerSeats: 8,
    netplay: "retroarch",
    note: "تبدأ معظم ألعاب PS1 بمقعدين، وترتفع المقاعد فقط عندما تتوافق اللعبة مع multitap.",
  },
  psp: {
    system: "psp",
    coreName: "PPSSPP",
    maxRoomMembers: 10,
    defaultControllerSeats: 2,
    maxControllerSeats: 4,
    netplay: "psp-network",
    note: "تتبع مقاعد PSP حد لعبة Ad-Hoc أو Infrastructure الأصلية وتحتاج اختبار اللعبة قبل فتح الغرفة.",
  },
  sega: {
    system: "sega",
    coreName: "Genesis Plus GX",
    maxRoomMembers: 10,
    defaultControllerSeats: 2,
    maxControllerSeats: 4,
    netplay: "retroarch",
    note: "تعتمد المقاعد على اللعبة والـmultitap، ولا تُفتح أكثر من قدرة اللعبة الفعلية.",
  },
  arcade: {
    system: "arcade",
    coreName: "MAME Arcade",
    maxRoomMembers: 10,
    defaultControllerSeats: 2,
    maxControllerSeats: 4,
    netplay: "retroarch",
    note: "يتم التحقق من عدد اللاعبين من تعريف لعبة الآركيد قبل بدء الجلسة.",
  },
};

export function capabilityFor(system: RoomSystem): EmulatorRoomCapability {
  return EMULATOR_ROOM_CAPABILITIES[system];
}
