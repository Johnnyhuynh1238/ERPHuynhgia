# QC Worklog — 2026-04-25

## 11:39 +07 — Final status automation stabilization
- Fixed `app/api/reports/evening/route.ts` to use centralized `recomputeTaskStatus(..., forceInProgress: true)` for evening activity `not_started -> in_progress`.
- Removed old inline status update/log path that wrote `Đổi trạng thái...` and bypassed `AUTO_STATUS` audit.
- Added targeted static smoke script: `scripts/smoke-task-status-static.ts`.
- Static smoke PASS: `output/reports/smoke-task-status-static-2026-04-25.json`.
- Build PASS: `npm run -s build`.
- Deploy attempt blocked by Docker daemon permission (`/var/run/docker.sock`); requires operator with sudo/root or docker group membership.
