#!/usr/bin/env node

/**
 * Cron: gửi nhắc nhiệm vụ KS (morning, tptc dueAt, eod).
 * Chạy mỗi phút: * * * * *
 *
 * Cài crontab (trên host máy chủ):
 *   * * * * * BASE_URL=http://127.0.0.1:3001 PUSH_CRON_KEY=xxx /usr/bin/node /path/to/erp-huynhgia6/scripts/push-reminders-cron.js >> /var/log/push-cron.log 2>&1
 */

const baseUrl = process.env.BASE_URL;
const cronKey = process.env.PUSH_CRON_KEY;

if (!baseUrl) {
  console.error("Missing BASE_URL");
  process.exit(1);
}
if (!cronKey) {
  console.error("Missing PUSH_CRON_KEY");
  process.exit(1);
}

fetch(`${baseUrl}/api/cron/push-reminders`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-cron-key": cronKey,
  },
})
  .then(async (res) => {
    const text = await res.text();
    if (!res.ok) {
      console.error(`[push-cron] HTTP ${res.status}: ${text}`);
      process.exit(2);
    }
    console.log(`[push-cron] ${new Date().toISOString()} ${text}`);
  })
  .catch((err) => {
    console.error("[push-cron] error:", err.message);
    process.exit(3);
  });
