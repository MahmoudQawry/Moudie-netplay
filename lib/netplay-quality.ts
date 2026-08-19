import type { Socket } from "socket.io-client";

export type NetplayQuality = {
  rttMs: number | null;
  jitterMs: number | null;
  probeLossPercent: number | null;
  grade: "CONNECTING" | "STABLE" | "FAIR" | "UNSTABLE";
};

const emptyQuality = (): NetplayQuality => ({ rttMs: null, jitterMs: null, probeLossPercent: null, grade: "CONNECTING" });

export function formatNetplayQuality(quality: NetplayQuality): string {
  return quality.rttMs === null ? "PING — · CONNECTING" : `PING ${quality.rttMs}ms · ${quality.grade}`;
}

/** Starts a server-RTT probe. It reports only values observed by this device. */
export function startNetplayQualityMonitor(socket: Socket, onQuality: (quality: NetplayQuality) => void) {
  let sequence = 0;
  let previousRtt: number | null = null;
  let smoothedRtt: number | null = null;
  let smoothedJitter: number | null = null;
  const pending = new Map<number, number>();
  const outcomes: boolean[] = [];

  const recordOutcome = (received: boolean) => {
    outcomes.push(received);
    while (outcomes.length > 20) outcomes.shift();
  };
  const publish = () => {
    const loss = outcomes.length ? Math.floor((outcomes.filter((outcome) => !outcome).length * 100) / outcomes.length) : null;
    const rtt = smoothedRtt === null ? null : Math.round(smoothedRtt);
    const jitter = smoothedJitter === null ? null : Math.round(smoothedJitter);
    const grade: NetplayQuality["grade"] = rtt === null ? "CONNECTING"
      : rtt <= 75 && (jitter ?? 0) <= 15 && (loss ?? 0) < 1 ? "STABLE"
        : rtt <= 150 && (jitter ?? 0) <= 35 && (loss ?? 0) <= 4 ? "FAIR"
          : "UNSTABLE";
    onQuality({ rttMs: rtt, jitterMs: jitter, probeLossPercent: loss, grade });
  };
  const prune = (now: number) => {
    for (const [id, sentAt] of pending) {
      if (now - sentAt < 2_500) continue;
      pending.delete(id);
      recordOutcome(false);
    }
  };
  const onPong = (payload: { sequence?: unknown }) => {
    const id = Number(payload?.sequence);
    const sentAt = pending.get(id);
    if (!Number.isSafeInteger(id) || sentAt === undefined) return;
    pending.delete(id);
    const rtt = Math.max(0, Date.now() - sentAt);
    const delta = previousRtt === null ? 0 : Math.abs(rtt - previousRtt);
    previousRtt = rtt;
    smoothedRtt = smoothedRtt === null ? rtt : (smoothedRtt * 0.7) + (rtt * 0.3);
    smoothedJitter = smoothedJitter === null ? delta : (smoothedJitter * 0.7) + (delta * 0.3);
    recordOutcome(true);
    publish();
  };
  const tick = () => {
    const now = Date.now();
    prune(now);
    if (socket.connected) {
      const id = sequence++;
      pending.set(id, now);
      socket.emit("netplay:quality-probe", { sequence: id });
    }
    publish();
  };

  socket.on("netplay:quality-pong", onPong);
  tick();
  const timer = setInterval(tick, 1_000);
  return () => {
    clearInterval(timer);
    socket.off("netplay:quality-pong", onPong);
  };
}

export { emptyQuality };
