#!/usr/bin/env node

/**
 * Cron: nhắc kế toán đặt NCC nếu đã duyệt > 5p mà chưa "đã đặt NCC".
 * Chạy mỗi phút: * * * * *
 *
 * Cài crontab (trên host máy chủ):
 *   * * * * * BASE_URL=http://127.0.0.1:3001 PUSH_CRON_KEY=xxx /usr/bin/node /path/to/erp-huynhgia6/scripts/proposal-reminders-cron.js >> /var/log/proposal-reminders.log 2>&1
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

fetch(`${baseUrl}/api/cron/proposal-reminders`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-cron-key": cronKey,
  },
})
  .then(async (res) => {
    const text = await res.text();
    if (!res.ok) {
      console.error(`[proposal-reminders] HTTP ${res.status}: ${text}`);
      process.exit(2);
    }
    console.log(`[proposal-reminders] ${new Date().toISOString()} ${text}`);
  })
  .catch((err) => {
    console.error("[proposal-reminders] error:", err.message);
    process.exit(3);
  });
