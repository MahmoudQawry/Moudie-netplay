/** 
 * PUBG-style: authoritative checkpoint interval
 * Reduced from 2500ms to 1500ms for faster divergence correction
 * while allowing inputs to keep flowing between checkpoints.
 */
export const NETPLAY_SYNC_INTERVAL_MS = 1500;

/**
 * PUBG-style: max frames before forcing a state sync
 * If one device gets too far ahead, force resync
 */
export const NETPLAY_MAX_DESYNC_FRAMES = 10;

/**
 * PUBG-style: jitter buffer sizes based on network quality
 */
export const JITTER_BUFFER_SIZES = {
  STABLE: 2,
  FAIR: 4,
  UNSTABLE: 6,
} as const;

export function normalizeSyncId(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

export function shouldApplyAuthoritativeState(lastApplied: number, incoming: number): boolean {
  return incoming > lastApplied;
}

// PUBG-style: calculate if desync is severe enough to force resync
export function isDesyncSevere(predictedFrames: number, frameDrift: number): boolean {
  return predictedFrames > 20 || Math.abs(frameDrift) > 100;
}

// Calculate adaptive frame delay based on network conditions
export function calculateAdaptiveDelay(rttMs: number, jitterMs: number, currentDelay: number): number {
  let targetDelay = currentDelay;
  
  if (rttMs > 150 || jitterMs > 35) {
    targetDelay = Math.min(8, currentDelay + 1);
  } else if (rttMs < 60 && jitterMs < 15 && currentDelay > 2) {
    targetDelay = Math.max(2, currentDelay - 1);
  }
  
  return targetDelay;
}
