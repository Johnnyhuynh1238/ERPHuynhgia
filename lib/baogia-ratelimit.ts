// In-memory abuse detection for /api/leads/baogia/calculate.
// Single-instance container ⇒ Map is enough; no Redis dependency.
// Window: 5 minutes rolling. Hard cap + soft "scrape" detector.

import { prisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/push-server";

type Entry = {
  // Rolling 5-minute window
  windowStartMs: number;
  count: number;
  // Distinct wizard-input combinations seen — high count = formula reverse-engineering
  combos: Set<string>;
  // Sticky soft-ban (15 min)
  banUntilMs: number;
  // For alert throttling — don't spam admins
  lastAlertMs: number;
};

const WINDOW_MS = 5 * 60 * 1000;            // 5 min
const HARD_LIMIT_PER_MIN = 60;              // > 60 req/min → temporary ban
const HARD_BAN_MS = 15 * 60 * 1000;         // 15 min ban after hard hit
const SOFT_COUNT_THRESHOLD = 100;           // > 100 req in 5 min → alert
const SOFT_DISTINCT_THRESHOLD = 50;         // > 50 distinct combos in 5 min → alert (formula sweep)
const ALERT_COOLDOWN_MS = 30 * 60 * 1000;   // re-alert at most every 30 min per IP

const store = new Map<string, Entry>();

// Periodic GC — drop entries that haven't been seen in 30 min
const GC_INTERVAL_MS = 5 * 60 * 1000;
let gcTimer: NodeJS.Timeout | null = null;
function ensureGc() {
  if (gcTimer) return;
  gcTimer = setInterval(() => {
    const now = Date.now();
    store.forEach((v, k) => {
      if (now - v.windowStartMs > 30 * 60 * 1000 && now > v.banUntilMs) {
        store.delete(k);
      }
    });
  }, GC_INTERVAL_MS);
  // Don't keep process alive solely for GC
  if (typeof gcTimer.unref === "function") gcTimer.unref();
}

export type RateLimitDecision =
  | { allow: true; remaining: number }
  | { allow: false; reason: "hard_limit" | "banned"; retryAfterSec: number };

export function checkRate(ip: string, comboKey: string): RateLimitDecision {
  ensureGc();
  const now = Date.now();
  let e = store.get(ip);
  if (!e || now - e.windowStartMs > WINDOW_MS) {
    e = {
      windowStartMs: now,
      count: 0,
      combos: new Set(),
      banUntilMs: e?.banUntilMs ?? 0,
      lastAlertMs: e?.lastAlertMs ?? 0,
    };
    store.set(ip, e);
  }

  // Sticky ban check first
  if (now < e.banUntilMs) {
    return { allow: false, reason: "banned", retryAfterSec: Math.ceil((e.banUntilMs - now) / 1000) };
  }

  // Hard per-minute (count requests in the last 60s — approximated via window count
  // scaled by elapsed). Simpler: cap window at HARD_LIMIT_PER_MIN * 5.
  // We use a separate per-minute check below.
  e.count += 1;
  e.combos.add(comboKey);

  const elapsedSec = Math.max(1, Math.floor((now - e.windowStartMs) / 1000));
  const reqPerMin = (e.count / elapsedSec) * 60;
  if (reqPerMin > HARD_LIMIT_PER_MIN && e.count >= 30) {
    e.banUntilMs = now + HARD_BAN_MS;
    return { allow: false, reason: "hard_limit", retryAfterSec: Math.ceil(HARD_BAN_MS / 1000) };
  }

  // Soft / alert thresholds — don't block, but trigger admin push (Đợt 5)
  const hitSoft =
    e.count > SOFT_COUNT_THRESHOLD || e.combos.size > SOFT_DISTINCT_THRESHOLD;
  if (hitSoft && now - e.lastAlertMs > ALERT_COOLDOWN_MS) {
    e.lastAlertMs = now;
    // Fire-and-forget; do not block the request
    void alertAdmins(ip, e).catch((err) =>
      console.error("[baogia/ratelimit] alert failed:", err),
    );
  }

  return { allow: true, remaining: Math.max(0, SOFT_COUNT_THRESHOLD - e.count) };
}

async function alertAdmins(ip: string, e: Entry) {
  const admins = await prisma.user.findMany({
    where: { role: "admin", isActive: true },
    select: { id: true },
  });
  if (!admins.length) return;

  const minutes = Math.max(1, Math.round((Date.now() - e.windowStartMs) / 60000));
  const title = `Nghi scrape báo giá từ IP ${ip}`;
  const body = `${e.count} request / ${e.combos.size} biến thể trong ${minutes} phút`;
  const link = `/admin?baogia_abuse=${encodeURIComponent(ip)}`;

  // Use existing staffNotification + push pattern (mirrors /api/leads/baogia notify)
  // NOTE: dùng kind `baogia_lead` cho alert abuse luôn (tránh migration enum mới).
  // Title đã ghi rõ "Nghi scrape báo giá" nên admin không nhầm với lead thật.
  await prisma.staffNotification
    .createMany({
      data: admins.map((a) => ({
        recipientId: a.id,
        kind: "baogia_lead" as const,
        title,
        body,
        link,
        refType: "baogia_abuse",
        refId: ip,
      })),
    })
    .catch((err) => console.warn("[baogia/ratelimit] notif insert skipped:", err?.message));

  await Promise.allSettled(
    admins.map((a) =>
      sendPushToUser(a.id, {
        title,
        body,
        url: link,
        tag: `baogia-abuse-${ip}`,
        requireInteraction: false,
      }),
    ),
  );

  console.warn(`[baogia/abuse] IP=${ip} count=${e.count} distinct=${e.combos.size} window=${minutes}min`);
}

// Exposed for test reset
export function _resetForTest() {
  store.clear();
}
