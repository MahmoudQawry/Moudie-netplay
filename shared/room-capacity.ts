export const MIN_ACTIVE_PLAYERS = 2;
export const MAX_ACTIVE_PLAYERS = 8;
export const MAX_SPECTATORS = 4;
export const MAX_ROOM_MEMBERS = MAX_ACTIVE_PLAYERS + MAX_SPECTATORS;

export const ROOM_CAPACITY_LABEL = `${MIN_ACTIVE_PLAYERS}-${MAX_ACTIVE_PLAYERS} PLAYERS · ${MAX_SPECTATORS} SPECTATORS`;

export function activeSeatNumber(memberIds: number[], memberId: number): number | null {
  const index = memberIds.indexOf(memberId);
  return index >= 0 && index < MAX_ACTIVE_PLAYERS ? index + 1 : null;
}

export function canStartOnlineSession(activePlayers: number): boolean {
  return activePlayers >= MIN_ACTIVE_PLAYERS && activePlayers <= MAX_ACTIVE_PLAYERS;
}
