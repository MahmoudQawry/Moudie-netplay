export type ReadySessionPeer = {
  memberId: number;
  role: "host" | "player";
  fingerprint: string;
  coreVersion: string;
};

export type SessionBarrier = {
  fingerprint: string;
  coreVersion: string;
  hostMemberId: number;
  playerMemberIds: number[];
  startAt: number;
};

export function createSessionBarrier(peers: ReadySessionPeer[], now: number, leadTimeMs = 3000): SessionBarrier | null {
  const host = peers.find((peer) => peer.role === "host");
  if (!host || peers.length < 2 || peers.length > 8) return null;
  if (peers.some((peer) => peer.fingerprint !== host.fingerprint || peer.coreVersion !== host.coreVersion)) return null;
  return {
    fingerprint: host.fingerprint,
    coreVersion: host.coreVersion,
    hostMemberId: host.memberId,
    playerMemberIds: peers.map((peer) => peer.memberId),
    startAt: now + leadTimeMs,
  };
}
