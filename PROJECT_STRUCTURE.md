# ERP Huỳnh Gia – Project Structure (Customer Portal Phase A–E)

- Path: `/home/claudeuser/.openclaw/workspace/erp-huynhgia6`
- Updated at: `2026-04-26 14:55 Asia/Saigon`
- Branch: `master`

## 1) Module Cổng Chủ Nhà – trạng thái

Đã hoàn thiện end-to-end theo spec (Phase A→E):
- Public portal routes `/cn/[token]/*` (không dùng NextAuth)
- Login pass 4 số + rate limit 5 lần/30 phút theo IP
- Session cookie riêng `cn_session_<projectId>` + session DB
- Hết hạn link theo `actualEndDate + 30 ngày` + API/cron disable link
- Dashboard/timeline/task/photos/payments/journal cho chủ nhà
- Comment 2 chiều (chủ nhà ↔ staff), unread badge + mark read + reply
- Acknowledgment milestone có chữ ký vẽ tay canvas + IP + userAgent + unique task
- PWA manifest riêng + banner gợi ý cài app
- Export PDF nhật ký thi công

## 2) Cấu trúc chính liên quan Customer Portal

```text
erp-huynhgia6/
├── app/
│   ├── cn/
│   │   └── [token]/
│   │       ├── _components/
│   │       │   ├── acknowledgment-form.tsx
│   │       │   ├── customer-portal-login-form.tsx
│   │       │   ├── customer-portal-shell.tsx
│   │       │   └── install-app-banner.tsx
│   │       ├── acknowledge/[taskId]/route.ts
│   │       ├── comments/new/route.ts
│   │       ├── dashboard/page.tsx
│   │       ├── journal/page.tsx
│   │       ├── journal/export.pdf/route.ts
│   │       ├── layout.tsx
│   │       ├── login/route.ts
│   │       ├── page.tsx
│   │       ├── payments/page.tsx
│   │       ├── photos/page.tsx
│   │       ├── tasks/page.tsx
│   │       ├── tasks/[taskId]/page.tsx
│   │       └── timeline/page.tsx
│   └── api/
│       ├── customer-portal/expire/route.ts
│       ├── customer-comments/
│       │   ├── unread-count/route.ts
│       │   └── [id]/{mark-read,reply}/route.ts
│       └── projects/[id]/
│           ├── customer-comments/route.ts
│           └── customer-portal/
│               ├── password/route.ts
│               └── reset/route.ts
├── lib/
│   ├── customer-portal.ts
│   └── auth-helpers.ts
├── public/
│   ├── cn-manifest.json
│   └── icons/{icon-192.png,icon-512.png,icon-maskable-512.png}
├── prisma/
│   ├── schema.prisma
│   └── migrations/20260426120500_add_customer_portal/
└── scripts/
    └── customer-portal-expire-cron.js
```

## 3) Security boundaries đã enforce

- `middleware.ts` tách luồng `/cn/*`, không dùng NextAuth cho portal
- `lib/customer-portal.ts` kiểm tra token project + enabled + expiry
- Chỉ query task `visibleToCustomer=true` ở toàn bộ portal route
- Route internal staff vẫn đi qua `getCurrentUser/requireRole`
- Reset token xóa toàn bộ `customer_sessions` + `customer_login_attempts`

## 4) Vận hành

- Cron disable link quá hạn:
  - API: `POST /api/customer-portal/expire` (x-cron-key hoặc admin/TPTC)
  - Script: `node scripts/customer-portal-expire-cron.js`
- Build production: `npm run build`
- Migration production: `npx prisma migrate deploy`
