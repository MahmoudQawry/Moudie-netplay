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

/** Every Moudie online room is capped at 8 active players + 4 spectators. */
export const EMULATOR_ROOM_CAPABILITIES: Record<RoomSystem, EmulatorRoomCapability> = {
  nes: {
    system: "nes", coreName: "FCEUmm", maxRoomMembers: 12, defaultControllerSeats: 2, maxControllerSeats: 4,
    netplay: "retroarch", note: "2-8 active players and up to 4 spectators; controller ports remain game-dependent.",
  },
  ps1: {
    system: "ps1", coreName: "PCSX-ReARmed", maxRoomMembers: 12, defaultControllerSeats: 2, maxControllerSeats: 8,
    netplay: "retroarch", note: "2-8 active players and up to 4 spectators; eight inputs require a compatible multitap title.",
  },
  psp: {
    system: "psp", coreName: "PPSSPP", maxRoomMembers: 12, defaultControllerSeats: 2, maxControllerSeats: 4,
    netplay: "psp-network", note: "2-8 active players and up to 4 spectators; actual network/controller limits remain game-dependent.",
  },
  sega: {
    system: "sega", coreName: "Genesis Plus GX", maxRoomMembers: 12, defaultControllerSeats: 2, maxControllerSeats: 4,
    netplay: "retroarch", note: "2-8 active players and up to 4 spectators; actual input ports remain game-dependent.",
  },
  arcade: {
    system: "arcade", coreName: "MAME Arcade", maxRoomMembers: 12, defaultControllerSeats: 2, maxControllerSeats: 4,
    netplay: "retroarch", note: "2-8 active players and up to 4 spectators; actual arcade panel ports remain game-dependent.",
  },
};

export function capabilityFor(system: RoomSystem): EmulatorRoomCapability {
  return EMULATOR_ROOM_CAPABILITIES[system];
}
