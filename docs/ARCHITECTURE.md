# Architecture Overview

## Tech stack
- Next.js 14 App Router (TypeScript)
- Prisma + PostgreSQL
- NextAuth for staff/internal area
- Token/session flow riêng cho customer portal
- Tailwind + React component-based UI

## High-level modules

### 1) Staff/Internal ERP
- Main app and admin/staff workflows.
- Protected by NextAuth + role checks.
- Uses server APIs under `app/api/*` for internal operations.

### 2) Customer Portal (public link with controlled access)
- Route base: `app/cn/[token]/*`
- Access model:
  - Project-specific token in URL
  - PIN/login flow for customer
  - Session cookie for portal scope
- Core pages: dashboard, timeline, tasks, photos, payments, journal.

### 3) Data + persistence
- Prisma schema and migrations in `prisma/`
- PostgreSQL as primary data store
- Domain data for project/tasks/comments/photos/payments

### 4) Media/files
- MinIO/S3-compatible storage
- Upload/read paths used by task and photo features

## Security boundaries
- `middleware.ts` is primary request boundary for route split.
- Customer portal does not reuse staff auth directly.
- Customer-visible data must be filtered (e.g. visibility flags, project token ownership).
- Internal job endpoints must use secret headers.

## Runtime flow (simplified)
1. Request enters middleware and is classified (staff vs customer portal).
2. Auth/session validation happens per boundary.
3. Route handler/page loads data via Prisma.
4. UI renders by feature area.

## Operational notes
- Build validation: `npm run build`
- Static checks: `npm run lint`
- Seed data: `npm run db:seed`
- Portal expiry automation is handled via API/script in the repo.

## Source anchors
- `app/cn/[token]/`
- `app/api/`
- `lib/customer-portal.ts`
- `middleware.ts`
- `prisma/schema.prisma`
