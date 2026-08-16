/** Short authoritative checkpoint interval: chosen to correct divergence promptly
 * while allowing inputs to keep flowing between checkpoints. */
export const NETPLAY_SYNC_INTERVAL_MS = 2500;

export function normalizeSyncId(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

export function shouldApplyAuthoritativeState(lastApplied: number, incoming: number): boolean {
  return incoming > lastApplied;
}
