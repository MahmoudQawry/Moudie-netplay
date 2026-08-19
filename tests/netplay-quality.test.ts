import { describe, expect, it, vi } from "vitest";

import { formatNetplayQuality, startNetplayQualityMonitor } from "../lib/netplay-quality";

class SocketStub {
  connected = true;
  emitted: Array<{ event: string; payload: unknown }> = [];
  private listeners = new Map<string, (payload: any) => void>();
  emit(event: string, payload: unknown) { this.emitted.push({ event, payload }); return this; }
  on(event: string, listener: (payload: any) => void) { this.listeners.set(event, listener); return this; }
  off(event: string) { this.listeners.delete(event); return this; }
  receive(event: string, payload: unknown) { this.listeners.get(event)?.(payload); }
}

describe("NetPlay quality monitor", () => {
  it("publishes measured RTT and a stable grade after a real probe response", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const socket = new SocketStub();
    const updates: ReturnType<typeof vi.fn> = vi.fn();
    const stop = startNetplayQualityMonitor(socket as never, updates);
    const initialProbe = socket.emitted[0]?.payload as { sequence: number };
    vi.advanceTimersByTime(42);
    socket.receive("netplay:quality-pong", { sequence: initialProbe.sequence });
    expect(updates.mock.lastCall?.[0]).toMatchObject({ rttMs: 42, grade: "STABLE" });
    stop();
    vi.useRealTimers();
  });

  it("does not invent a ping before receiving a server response", () => {
    expect(formatNetplayQuality({ rttMs: null, jitterMs: null, probeLossPercent: null, grade: "CONNECTING" })).toBe("PING — · CONNECTING");
  });
});
