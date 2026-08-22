export type RoomSystem = "nes" | "ps1" | "psp" | "sega" | "arcade";

export const MIN_ACTIVE_PLAYERS = 2;
export const STANDARD_MAX_ACTIVE_PLAYERS = 6;
// Compatibility export for server code that applies the standard room limit.
// NES/Famicom callers must use roomCapacityFor("nes") and remain capped at two players.
export const MAX_ACTIVE_PLAYERS = STANDARD_MAX_ACTIVE_PLAYERS;
export const STANDARD_MAX_SPECTATORS = 4;
export const FAMICOM_MAX_ACTIVE_PLAYERS = 2;
export const FAMICOM_MAX_SPECTATORS = 6;

export type RoomCapacity = {
  minPlayers: number;
  maxPlayers: number;
  maxSpectators: number;
};

export const ROOM_CAPACITIES: Record<RoomSystem, RoomCapacity> = {
  nes: { minPlayers: MIN_ACTIVE_PLAYERS, maxPlayers: FAMICOM_MAX_ACTIVE_PLAYERS, maxSpectators: FAMICOM_MAX_SPECTATORS },
  ps1: { minPlayers: MIN_ACTIVE_PLAYERS, maxPlayers: STANDARD_MAX_ACTIVE_PLAYERS, maxSpectators: STANDARD_MAX_SPECTATORS },
  psp: { minPlayers: MIN_ACTIVE_PLAYERS, maxPlayers: STANDARD_MAX_ACTIVE_PLAYERS, maxSpectators: STANDARD_MAX_SPECTATORS },
  sega: { minPlayers: MIN_ACTIVE_PLAYERS, maxPlayers: STANDARD_MAX_ACTIVE_PLAYERS, maxSpectators: STANDARD_MAX_SPECTATORS },
  arcade: { minPlayers: MIN_ACTIVE_PLAYERS, maxPlayers: STANDARD_MAX_ACTIVE_PLAYERS, maxSpectators: STANDARD_MAX_SPECTATORS },
};

export function roomCapacityFor(system: RoomSystem): RoomCapacity {
  return ROOM_CAPACITIES[system];
}

export function roomMemberLimit(system: RoomSystem): number {
  const capacity = roomCapacityFor(system);
  return capacity.maxPlayers + capacity.maxSpectators;
}

export function canStartOnlineSession(system: RoomSystem, activePlayers: number): boolean {
  const capacity = roomCapacityFor(system);
  return activePlayers >= capacity.minPlayers && activePlayers <= capacity.maxPlayers;
}

export function activeSeatNumber(memberIds: number[], memberId: number, system: RoomSystem = "ps1"): number | null {
  const index = memberIds.indexOf(memberId);
  const maxPlayers = roomCapacityFor(system).maxPlayers;
  return index >= 0 && index < maxPlayers ? index + 1 : null;
}

export function roomCapacityLabel(system: RoomSystem): string {
  const capacity = roomCapacityFor(system);
  return `${capacity.minPlayers}-${capacity.maxPlayers} PLAYERS · ${capacity.maxSpectators} SPECTATORS`;
}
