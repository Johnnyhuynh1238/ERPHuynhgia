#!/usr/bin/env node

/**
 * Cron mẫu: disable portal khi quá hạn 30 ngày sau actualEndDate
 * Cách dùng (host):
 *   BASE_URL=https://erp.example.com CRON_KEY=xxx node scripts/customer-portal-expire-cron.js
 */

const baseUrl = process.env.BASE_URL;

if (!baseUrl) {
  console.error("Missing BASE_URL");
  process.exit(1);
}

fetch(`${baseUrl}/api/customer-portal/expire`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-cron-key": process.env.CUSTOMER_PORTAL_CRON_KEY || "",
  },
})
  .then(async (res) => {
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error("Expire cron failed", res.status, json);
      process.exit(1);
    }
    console.log("Expire cron success", json);
  })
  .catch((error) => {
    console.error("Expire cron error", error);
    process.exit(1);
  });
