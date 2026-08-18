export const MAX_ACTIVE_PLAYERS = 8;
export const MAX_SPECTATORS = 8;
export const MAX_ROOM_MEMBERS = MAX_ACTIVE_PLAYERS + MAX_SPECTATORS;

export const ROOM_CAPACITY_LABEL = `${MAX_ACTIVE_PLAYERS} PLAYERS · ${MAX_SPECTATORS} SPECTATORS`;

export function activeSeatNumber(memberIds: number[], memberId: number): number | null {
  const index = memberIds.indexOf(memberId);
  return index >= 0 && index < MAX_ACTIVE_PLAYERS ? index + 1 : null;
}
