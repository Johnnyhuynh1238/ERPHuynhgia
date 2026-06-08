// Per-user rate limit cho /api/proposals/chat.
// Single-instance container ⇒ Map đủ; không cần Redis.
// 3 cửa sổ: 10/phút, 50/30 phút, 100/ngày.

type UserHits = { timestamps: number[] };

const WINDOWS = [
  { ms: 60_000, limit: 10, label: "phút" },
  { ms: 30 * 60_000, limit: 50, label: "30 phút" },
  { ms: 24 * 60 * 60_000, limit: 100, label: "ngày" },
] as const;

const MAX_WINDOW_MS = WINDOWS[WINDOWS.length - 1].ms;
const GC_INTERVAL_MS = 10 * 60 * 1000;

const store = new Map<string, UserHits>();

let gcTimer: NodeJS.Timeout | null = null;
function ensureGc() {
  if (gcTimer) return;
  gcTimer = setInterval(() => {
    const now = Date.now();
    store.forEach((v, k) => {
      const fresh = v.timestamps.filter((t) => now - t < MAX_WINDOW_MS);
      if (fresh.length === 0) store.delete(k);
      else v.timestamps = fresh;
    });
  }, GC_INTERVAL_MS);
  if (typeof gcTimer.unref === "function") gcTimer.unref();
}

export type ChatRateDecision =
  | { allow: true; remainingDaily: number }
  | { allow: false; window: string; limit: number; retryAfterSec: number };

export function checkChatRate(userId: string): ChatRateDecision {
  ensureGc();
  const now = Date.now();
  const e = store.get(userId) ?? { timestamps: [] };
  e.timestamps = e.timestamps.filter((t) => now - t < MAX_WINDOW_MS);

  for (const w of WINDOWS) {
    const inWindow = e.timestamps.filter((t) => now - t < w.ms);
    if (inWindow.length >= w.limit) {
      const oldest = Math.min(...inWindow);
      const retryAfterSec = Math.max(1, Math.ceil((oldest + w.ms - now) / 1000));
      return { allow: false, window: w.label, limit: w.limit, retryAfterSec };
    }
  }

  e.timestamps.push(now);
  store.set(userId, e);

  const dailyUsed = e.timestamps.length;
  return { allow: true, remainingDaily: Math.max(0, WINDOWS[2].limit - dailyUsed) };
}

export function _resetForTest() {
  store.clear();
}
