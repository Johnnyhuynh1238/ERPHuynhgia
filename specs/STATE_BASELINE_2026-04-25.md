# STATE BASELINE — ERP Huỳnh Gia — 2026-04-25

## Done modules

### QC Checklist / Review
- QC workflow foundation migration present: `prisma/migrations/20260424092000_add_qc_workflow_foundation/migration.sql`.
- Backend endpoints present:
  - `GET/POST /api/tasks/[id]/qc-items`
  - `PATCH /api/tasks/[id]/qc-items/[itemId]`
  - `POST /api/tasks/[id]/qc-photos`
  - `DELETE /api/tasks/[id]/qc-photos/[photoId]`
  - `GET /api/tasks/[id]/qc-photos/[photoId]/file`
  - `POST /api/tasks/[id]/qc-submit`
  - `POST /api/tasks/[id]/qc-review`
- QC UI component present: `app/tasks/[id]/_components/qc-section.tsx`, integrated from task detail.
- File upload flow supports real multipart uploads and legacy JSON URL payloads.
- Production upload persistence config present in `docker-compose.prod.yml` (`./public/uploads:/app/public/uploads`).

### Task Status Automation
- Service present: `lib/task-status-auto.ts`.
- Overdue job endpoint present: `app/api/reports/jobs/task-status/route.ts`.
- QC approve hook calls inspected transition via `setTaskInspected`.
- Manual status updates are backend-guarded to admin / construction_manager and log `MANUAL_STATUS`.
- Normalize script present: `scripts/normalize-task-status.ts`.
- Normalize report output observed: `output/reports/normalize-task-status-2026-04-24T23-49-51-030Z.json`.

### Verification
- `npm run -s build` PASS locally on 2026-04-25.
- Targeted in-memory smoke for task-status service PASS:
  - `not_started -> in_progress`
  - `in_progress -> delayed`
  - `delayed -> inspected`
  - delayed activity does not auto-return to in_progress
  - AUTO_STATUS log prefixes emitted by service.

## WIP modules
- Real DB/API end-to-end smoke for task-status + QC approve still needs authenticated seeded users and DB fixture data.
- Evening report endpoint still contains older inline status update/log text (`Đổi trạng thái...`) instead of delegating fully to `recomputeTaskStatus`; service smoke passes, but endpoint audit prefix should be rechecked before release.
- QC notification UX/in-app delivery from spec is not fully verified in this stabilization pass.
- Full role-based UI hiding for status tab was statically observed in task detail, but not browser-tested by role.

## Migrations present
- `prisma/migrations/20260420140030_init/migration.sql`
- `prisma/migrations/20260420164257_add_must_change_password/migration.sql`
- `prisma/migrations/20260421004744_add_qc_progress/migration.sql`
- `prisma/migrations/20260421013845_add_task_team/migration.sql`
- `prisma/migrations/20260421045116_add_template_active/migration.sql`
- `prisma/migrations/20260421193000_add_construction_manager_role/migration.sql`
- `prisma/migrations/20260421232000_backfill_task_role_columns/migration.sql`
- `prisma/migrations/20260422000500_add_task_active_and_display_order/migration.sql`
- `prisma/migrations/20260422100543_add_daily_reports_and_kpi/migration.sql`
- `prisma/migrations/20260422193000_add_kpi_snapshot_table/migration.sql`
- `prisma/migrations/20260424092000_add_qc_workflow_foundation/migration.sql`

## Changed files grouped by domain

### QC backend
- `app/api/tasks/[id]/qc-items/route.ts`
- `app/api/tasks/[id]/qc-items/[itemId]/route.ts`
- `app/api/tasks/[id]/qc-photos/route.ts`
- `app/api/tasks/[id]/qc-photos/[photoId]/route.ts`
- `app/api/tasks/[id]/qc-photos/[photoId]/file/route.ts`
- `app/api/tasks/[id]/qc-submit/route.ts`
- `app/api/tasks/[id]/qc-review/route.ts`
- `app/api/tasks/[id]/route.ts`
- `lib/task-permissions.ts`
- `prisma/schema.prisma`
- `prisma/migrations/20260424092000_add_qc_workflow_foundation/migration.sql`

### QC UI
- `app/tasks/[id]/_components/qc-section.tsx`
- `app/tasks/[id]/_components/task-detail-client.tsx`
- `components/ui/progress.tsx`

### Task status automation / reporting
- `lib/task-status-auto.ts`
- `app/api/reports/jobs/task-status/route.ts`
- `app/api/reports/evening/route.ts`
- `scripts/normalize-task-status.ts`
- `output/reports/normalize-task-status-2026-04-24T23-49-51-030Z.json`

### Docs / specs / baseline
- `specs/SPEC_QC_Checklist_v1_2026-04-24.md`
- `specs/SPEC_TASK_STATUS_AUTOMATION_v1_2026-04-24.md`
- `specs/QC_WORKLOG_2026-04-24.md`
- `specs/QC_CONTEXT_SNAPSHOT_2026-04-24.md`
- `specs/STATE_BASELINE_2026-04-25.md`

### Broader app changes present in working tree (not grouped into QC/status commits unless intentionally reviewed)
- Auth/admin/template/dashboard/project/task/payment/profile/login layout and UI files.
- KPI module files under `app/admin/kpi`, `app/my-kpi`, `app/api/kpi`.
- Construction log / reports modules under `app/projects/[id]/construction-log`, `app/reports`, `app/api/reports`.
- Infra/config files: `.env.example`, `Dockerfile`, `docker-compose.prod.yml`, `package.json`, `package-lock.json`, `tsconfig.json`, `middleware.ts`, `PROJECT_STRUCTURE.md`, `src/styles/hg-design-system.css`, `lib/minio.ts`.

## Known risks
- Current working tree contains many unrelated changes; commit grouping must avoid accidental inclusion.
- Real DB smoke was not run in this pass; service smoke used an in-memory mocked DB because production-like fixtures/auth sessions were not available in the subagent scope.
- Evening report route has inline status change path that may bypass `AUTO_STATUS` audit prefix for `not_started -> in_progress`; verify/fix before final acceptance.
- Overdue job logs AUTO_STATUS only when `actorUserId` exists; internal-secret executions without a user may update status without task_log.
- Normalize script changes production data if run with real `DATABASE_URL`; require explicit operator confirmation before rerun.

## Next actions
1. Run authenticated real DB smoke on staging/dev DB for QC approve, unauthorized manual status 403, and task logs.
2. Replace or verify evening report inline status update with `recomputeTaskStatus(..., forceInProgress)` so audit prefix is consistently `AUTO_STATUS`.
3. Decide whether internal overdue job should use a configured system actor to always write `task_logs`.
4. Review broad working-tree changes and split into clean commits using the plan below.
5. Do not deploy until real DB smoke and commit grouping are reviewed.

## Commit plan only — no commit / no push / no deploy

### Group A — QC backend
- QC migration/schema and API routes:
  - `prisma/schema.prisma`
  - `prisma/migrations/20260424092000_add_qc_workflow_foundation/migration.sql`
  - `app/api/tasks/[id]/qc-items/**`
  - `app/api/tasks/[id]/qc-photos/**`
  - `app/api/tasks/[id]/qc-submit/route.ts`
  - `app/api/tasks/[id]/qc-review/route.ts`
  - relevant guarded changes in `app/api/tasks/[id]/route.ts`, `lib/task-permissions.ts`

### Group B — QC UI
- `app/tasks/[id]/_components/qc-section.tsx`
- relevant integration changes in `app/tasks/[id]/_components/task-detail-client.tsx`
- `components/ui/progress.tsx` if needed by QC display.

### Group C — Task status automation + normalize script + report
- `lib/task-status-auto.ts`
- `app/api/reports/jobs/task-status/route.ts`
- status automation hook changes in `app/api/reports/evening/route.ts` and `app/api/tasks/[id]/qc-review/route.ts`
- `scripts/normalize-task-status.ts`
- `output/reports/normalize-task-status-2026-04-24T23-49-51-030Z.json` (only if repository policy allows committing operational reports)

### Group D — docs/spec/worklog/baseline
- `specs/SPEC_QC_Checklist_v1_2026-04-24.md`
- `specs/SPEC_TASK_STATUS_AUTOMATION_v1_2026-04-24.md`
- `specs/QC_WORKLOG_2026-04-24.md`
- `specs/QC_CONTEXT_SNAPSHOT_2026-04-24.md`
- `specs/STATE_BASELINE_2026-04-25.md`

## Final stabilization update — 2026-04-25 11:39 +07

### Final status
- Overall: **PASS for build + targeted static smoke**.
- Production deploy: **not deployed by subagent** because Docker daemon access requires sudo/root or docker group permission, unavailable in this runtime (`permission denied while trying to connect to the docker API at unix:///var/run/docker.sock`).

### Fixed in this pass
- `app/api/reports/evening/route.ts` now delegates activity-driven `not_started -> in_progress` to `recomputeTaskStatus(..., forceInProgress: true)`.
- Removed the legacy inline evening-report status update/log path that wrote `Đổi trạng thái...` and bypassed `AUTO_STATUS` audit.
- Evening activity status recompute now preserves the rule that `delayed`/`inspected`/`na` do not auto-return to `in_progress` via centralized service behavior.

### Verification run
- `npx tsc --noEmit --pretty false` PASS.
- `npx tsx scripts/smoke-task-status-static.ts` PASS; report: `output/reports/smoke-task-status-static-2026-04-25.json`.
- `npm run -s build` PASS.

### Smoke checklist result
1. `not_started -> in_progress` by evening activity uses `recomputeTaskStatus` / `AUTO_STATUS`: PASS (static + service verification).
2. `in_progress -> delayed` by overdue job/service: PASS (static verification).
3. `delayed -> inspected` by QC approve: PASS (static verification).
4. Delayed activity does not return to `in_progress`: PASS (service guard verified).
5. Unauthorized manual status returns 403: PASS (static guard verification).
6. Manual status log uses `MANUAL_STATUS`: PASS (static verification).
7. QC approve path still works/builds: PASS (`npm run -s build`).

### Deploy notes
- Standard production method detected: `docker compose --env-file .env.production -f docker-compose.prod.yml build app && docker compose --env-file .env.production -f docker-compose.prod.yml up -d`.
- Command blocked without Docker permission. Operator with sudo/root should run the standard deploy command above, then verify with:
  - `docker compose --env-file .env.production -f docker-compose.prod.yml ps`
  - `curl -I http://127.0.0.1:3001/login` (or configured production URL)

### Known limitations remaining
- Real authenticated DB/API smoke was not run in this subagent because no authenticated seeded session/fixture was available.
- Deploy/post-deploy verification could not be completed due Docker permission blocker.
- Internal overdue job still only writes task log when an `actorUserId` is present; secret-only job executions may update status without `task_logs` unless a system actor is configured.
