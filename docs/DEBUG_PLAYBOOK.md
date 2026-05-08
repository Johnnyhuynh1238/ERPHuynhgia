# Debug Playbook

## 0) Baseline
```bash
npm run dev
npm run lint
```
If issue is production-like behavior, also run:
```bash
npm run build && npm run start
```

## 1) Customer portal cannot access page
Checklist:
1. Verify URL token and route under `/cn/[token]/*`.
2. Check middleware branch for portal routing.
3. Validate portal session/cookie creation path.
4. Confirm token is enabled and not expired.

Inspect:
- `middleware.ts`
- `lib/customer-portal.ts`
- `app/cn/[token]/login/route.ts`

## 2) Task or photo missing in customer portal
Checklist:
1. Confirm query is scoped to correct project/token.
2. Confirm visibility filters are applied and expected.
3. Confirm API returns expected payload shape.

Inspect:
- `app/cn/[token]/tasks/page.tsx`
- `app/cn/[token]/tasks/[taskId]/page.tsx`
- `app/cn/[token]/photos/page.tsx`
- `app/api/customer/[token]/tasks/[taskId]/...`

## 3) Comment unread badge wrong
Checklist:
1. Validate unread-count endpoint response.
2. Validate mark-read and reply endpoint updates.
3. Verify client refresh/invalidation after mutation.

Inspect:
- `app/api/customer-comments/unread-count/route.ts`
- `app/api/customer-comments/[id]/mark-read/route.ts`
- `app/api/customer-comments/[id]/reply/route.ts`

## 4) Auth mismatch between staff and customer portal
Checklist:
1. Ensure route is in the right auth boundary.
2. Confirm no staff-only guard applied on portal route.
3. Confirm no portal shortcut is leaking into internal APIs.

Inspect:
- `middleware.ts`
- `auth.ts`
- `lib/customer-portal.ts`

## 5) DB/migration issues
Checklist:
1. Confirm `DATABASE_URL` correctness.
2. Confirm schema and migration alignment.
3. Re-seed if local data drifted.

Commands:
```bash
npx prisma migrate status
npm run db:seed
```

## 6) Before closing a bug
- Reproduce on clean run.
- Validate golden path and one edge case.
- Run `npm run lint`.
- Run `npm run build` for risky route/auth/prisma changes.
