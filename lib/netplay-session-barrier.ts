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
  startAt: number;
};

export function createSessionBarrier(peers: ReadySessionPeer[], now: number, leadTimeMs = 3000): SessionBarrier | null {
  const host = peers.find((peer) => peer.role === "host");
  const player = peers.find((peer) => peer.role === "player");
  if (!host || !player) return null;
  if (host.fingerprint !== player.fingerprint || host.coreVersion !== player.coreVersion) return null;
  return {
    fingerprint: host.fingerprint,
    coreVersion: host.coreVersion,
    hostMemberId: host.memberId,
    startAt: now + leadTimeMs,
  };
}
