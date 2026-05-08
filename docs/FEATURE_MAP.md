# Feature Map

## Customer Portal (`/cn/[token]/*`)

### Authentication & session
- UI/login flow: `app/cn/[token]/_components/customer-portal-login-form.tsx`
- Login route: `app/cn/[token]/login/route.ts`
- Session/token logic: `lib/customer-portal.ts`
- Route boundary: `middleware.ts`

### Dashboard / timeline / journal / payments
- Dashboard: `app/cn/[token]/dashboard/page.tsx`
- Timeline: `app/cn/[token]/timeline/page.tsx`
- Journal: `app/cn/[token]/journal/page.tsx`
- Journal PDF export: `app/cn/[token]/journal/export.pdf/route.ts`
- Payments: `app/cn/[token]/payments/page.tsx`

### Tasks & acknowledgment
- Task list: `app/cn/[token]/tasks/page.tsx`
- Task detail: `app/cn/[token]/tasks/[taskId]/page.tsx`
- Acknowledge route: `app/cn/[token]/acknowledge/[taskId]/route.ts`
- Signature form component: `app/cn/[token]/_components/acknowledgment-form.tsx`

### Photos
- Portal photos page: `app/cn/[token]/photos/page.tsx`
- Task photo APIs (customer scoped): `app/api/customer/[token]/tasks/[taskId]/...`

### Comments / communication
- New comment: `app/cn/[token]/comments/new/route.ts`
- Unread counter API: `app/api/customer-comments/unread-count/route.ts`
- Mark read/reply APIs: `app/api/customer-comments/[id]/mark-read/route.ts`, `app/api/customer-comments/[id]/reply/route.ts`
- Project comments API: `app/api/projects/[id]/customer-comments/route.ts`

## Internal/customer portal administration
- Expire portal link API: `app/api/customer-portal/expire/route.ts`
- Reset/password APIs: `app/api/projects/[id]/customer-portal/reset/route.ts`, `app/api/projects/[id]/customer-portal/password/route.ts`
- Cron script: `scripts/customer-portal-expire-cron.js`

## Data layer
- Prisma schema: `prisma/schema.prisma`
- Migrations: `prisma/migrations/`

## Suggested edit order when implementing a feature
1. Define/confirm DB shape in Prisma.
2. Implement/adjust API route or server helper.
3. Wire UI page/component.
4. Verify middleware/auth boundary.
5. Run lint/build.
