import "server-only";

/**
 * Fixed-window counter in process memory. Good enough for a single self-hosted instance;
 * swap for a shared store before running several replicas.
 */
const windows = new Map<string, { start: number; count: number }>();

export function allow(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const w = windows.get(key);
  if (!w || now - w.start >= windowMs) {
    windows.set(key, { start: now, count: 1 });
    return true;
  }
  if (w.count >= limit) return false;
  windows.set(key, { start: w.start, count: w.count + 1 });
  return true;
}
