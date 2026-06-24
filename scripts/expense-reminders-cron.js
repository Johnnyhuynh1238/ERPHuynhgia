#!/usr/bin/env node

/**
 * Cron: nhắc kế toán mỗi lệnh chi đang pending.
 *   urgent  → 1 phút/lần
 *   normal  → 15 phút/lần
 * Chạy mỗi phút: * * * * *
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

fetch(`${baseUrl}/api/cron/expense-reminders`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-cron-key": cronKey,
  },
})
  .then(async (res) => {
    const text = await res.text();
    if (!res.ok) {
      console.error(`[expense-reminders] HTTP ${res.status}: ${text}`);
      process.exit(2);
    }
    console.log(`[expense-reminders] ${new Date().toISOString()} ${text}`);
  })
  .catch((err) => {
    console.error("[expense-reminders] error:", err.message);
    process.exit(3);
  });
