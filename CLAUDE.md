# CLAUDE.md

## Project
- Name: `erp-huynhgia6`
- Stack: Next.js 14 (App Router), TypeScript, Prisma, PostgreSQL, NextAuth, Tailwind
- Key domain: ERP thi công + Customer Portal (`/cn/[token]/*`)

## Quick start
```bash
npm install
npm run dev
```
- App local: `http://localhost:3000`

## Daily commands
```bash
npm run dev      # run local app
npm run lint     # lint code
npm run build    # production build check
npm run start    # run production build locally
npm run db:seed  # seed data via prisma/seed.ts
```

## Working agreement for code changes
- Prefer minimal diffs in existing files.
- Keep security boundaries intact:
  - Staff/internal APIs must preserve auth/role checks.
  - Customer portal routes must not bypass token/session checks.
- Do not change env var names unless explicitly required.
- Run `npm run lint` after non-trivial changes.
- Run `npm run build` before merge for risky changes (auth, prisma, routing, middleware).

## High-value locations
- Customer portal UI/routes: `app/cn/[token]/`
- Customer portal/server helpers: `lib/customer-portal.ts`
- Middleware/security split: `middleware.ts`
- Customer portal APIs: `app/api/customer-portal/`, `app/api/customer/`
- Prisma schema/migrations: `prisma/`
- Internal cron script: `scripts/customer-portal-expire-cron.js`

## Fast debug checklist
1. Reproduce with `npm run dev` and exact URL/token.
2. Check route-level guard and middleware behavior.
3. Check Prisma query filters (`visibleToCustomer`, token/project constraints).
4. Check env values used by that code path.
5. Re-run `npm run lint` and `npm run build` before closing.

## Existing internal docs to consult first
- `PROJECT_STRUCTURE.md`
- `docs/ARCHITECTURE.md`
- `docs/FEATURE_MAP.md`
- `docs/DEBUG_PLAYBOOK.md`
- `docs/ENV.md`
