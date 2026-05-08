# Runbook

## Local development
```bash
npm install
npm run dev
```

## Quality gates
```bash
npm run lint
npm run build
```

## Prisma/data tasks
```bash
npx prisma migrate status
npm run db:seed
```

## Customer portal expiry job
- API endpoint: `POST /api/customer-portal/expire`
- Script: `node scripts/customer-portal-expire-cron.js`
- Auth for job call: use configured secret header/key per implementation.

## Docker references
- Local/container docs: `README-docker.md`
- Compose files:
  - `docker-compose.yml`
  - `docker-compose.prod.yml`

## Incident triage quick order
1. Confirm service up and correct env loaded.
2. Confirm DB reachable and schema current.
3. Confirm auth boundary (staff vs customer portal).
4. Confirm API response and data filters.
5. Validate with lint/build before rollback or release.
