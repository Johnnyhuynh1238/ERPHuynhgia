# Environment Guide

## Canonical source
- Base template: `.env.example`
- Local runtime: `.env`
- Production runtime: `.env.production`

## Required variables (core)

### App/runtime
- `TZ`

### Database
- `POSTGRES_DB`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `DATABASE_URL`

### Auth
- `NEXTAUTH_SECRET`
- `NEXTAUTH_URL`

### Object storage (MinIO/S3-compatible)
- `MINIO_ROOT_USER`
- `MINIO_ROOT_PASSWORD`
- `MINIO_ENDPOINT`
- `MINIO_ACCESS_KEY`
- `MINIO_SECRET_KEY`
- `MINIO_BUCKET`

### Internal job security
- `INTERNAL_JOB_SECRET`

### Optional (phase-dependent)
- `SMTP_HOST`
- `SMTP_USER`
- `SMTP_PASS`

## Local setup flow
1. Copy from `.env.example` to `.env`.
2. Fill secrets with non-default values.
3. Ensure `DATABASE_URL` points to your local DB/container network.
4. Start app and verify auth + DB connectivity.

## Production notes
- Keep secrets in deployment secret manager/CI secret store.
- Do not commit real secrets.
- Rotate `NEXTAUTH_SECRET` and `INTERNAL_JOB_SECRET` when compromised.

## Debugging env issues
- Symptoms: auth loops, DB connection errors, missing files, internal jobs unauthorized.
- First checks:
  1. Missing variable or typo in variable name.
  2. Wrong value format (URL/port/secret).
  3. Env loaded in the wrong process/container.
  4. Different values between app service and scheduled job service.
