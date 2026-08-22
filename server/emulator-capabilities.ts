import { ROOM_CAPACITIES, roomMemberLimit, type RoomSystem } from "../shared/room-capacity.js";

export type EmulatorRoomCapability = {
  system: RoomSystem;
  coreName: string;
  maxRoomMembers: number;
  defaultControllerSeats: number;
  maxControllerSeats: number;
  netplay: "retroarch" | "psp-network";
  maxPlayers: number;
  maxSpectators: number;
  note: string;
};

/** Online room membership is deliberately capped per emulator to keep synchronization and voice traffic predictable. */
export const EMULATOR_ROOM_CAPABILITIES: Record<RoomSystem, EmulatorRoomCapability> = {
  nes: {
    system: "nes", coreName: "FCEUmm", maxRoomMembers: roomMemberLimit("nes"), defaultControllerSeats: 2, maxControllerSeats: 2,
    netplay: "retroarch", maxPlayers: ROOM_CAPACITIES.nes.maxPlayers, maxSpectators: ROOM_CAPACITIES.nes.maxSpectators,
    note: "Famicom/NES: exactly 2 active-player seats maximum and up to 6 spectators; the game core remains two-controller.",
  },
  ps1: {
    system: "ps1", coreName: "PCSX-ReARmed", maxRoomMembers: roomMemberLimit("ps1"), defaultControllerSeats: 2, maxControllerSeats: 6,
    netplay: "retroarch", maxPlayers: ROOM_CAPACITIES.ps1.maxPlayers, maxSpectators: ROOM_CAPACITIES.ps1.maxSpectators,
    note: "Up to 6 active players and 4 spectators; actual controller ports remain game-dependent.",
  },
  psp: {
    system: "psp", coreName: "PPSSPP", maxRoomMembers: roomMemberLimit("psp"), defaultControllerSeats: 2, maxControllerSeats: 6,
    netplay: "psp-network", maxPlayers: ROOM_CAPACITIES.psp.maxPlayers, maxSpectators: ROOM_CAPACITIES.psp.maxSpectators,
    note: "Up to 6 active players and 4 spectators; actual network/controller limits remain game-dependent.",
  },
  sega: {
    system: "sega", coreName: "Genesis Plus GX", maxRoomMembers: roomMemberLimit("sega"), defaultControllerSeats: 2, maxControllerSeats: 6,
    netplay: "retroarch", maxPlayers: ROOM_CAPACITIES.sega.maxPlayers, maxSpectators: ROOM_CAPACITIES.sega.maxSpectators,
    note: "Up to 6 active players and 4 spectators; actual input ports remain game-dependent.",
  },
  arcade: {
    system: "arcade", coreName: "MAME Arcade", maxRoomMembers: roomMemberLimit("arcade"), defaultControllerSeats: 2, maxControllerSeats: 6,
    netplay: "retroarch", maxPlayers: ROOM_CAPACITIES.arcade.maxPlayers, maxSpectators: ROOM_CAPACITIES.arcade.maxSpectators,
    note: "Up to 6 active players and 4 spectators; actual arcade panel ports remain game-dependent.",
  },
};

export function capabilityFor(system: RoomSystem): EmulatorRoomCapability {
  return EMULATOR_ROOM_CAPABILITIES[system];
}
