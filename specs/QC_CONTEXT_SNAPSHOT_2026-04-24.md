# QC Context Snapshot — 2026-04-24

## Goal
Nâng cấp QC checklist từ tick đơn giản sang quy trình 2 cấp (KS -> TPTC), có audit trail, evidence rules, review/lock.

## Approved Spec
- File: `specs/SPEC_QC_Checklist_v1_2026-04-24.md`
- Version: 1.0
- Status: Approved

## Completed (Phase 1 - Foundation)
1. Prisma schema extended:
   - Enums: `QcItemStatus`, `QcLogAction`, `QcReviewAction`
   - Models/tables: `QcItem`, `QcProgress`, `QcPhoto`, `QcLog`, `QcReview`
2. Migration created + applied:
   - `prisma/migrations/20260424092000_add_qc_workflow_foundation/migration.sql`
   - Includes data migration from:
     - `tasks.qc_checklist` -> `qc_items`
     - `tasks.qc_progress.checkedIndexes` -> `qc_progress`
3. Business rule added:
   - In `app/api/tasks/[id]/route.ts`
   - Block status move to `inspected` unless QC is 100% passed.

## Fixed During Phase 1
- SQL migration failure due to window function in WHERE; migration SQL corrected and re-applied successfully.

## Pending (Phase 2 - KS Flow)
1. API:
   - `GET /api/tasks/[id]/qc-items`
   - `POST /api/tasks/[id]/qc-items`
   - `PATCH /api/tasks/[id]/qc-items/[itemId]`
   - `POST /api/tasks/[id]/qc-photos`
   - `DELETE /api/tasks/[id]/qc-photos/[photoId]`
   - `POST /api/tasks/[id]/qc-submit`
2. UI Task Detail QC tab:
   - 3 trạng thái từng item (unchecked/passed/failed)
   - Note + no-photo flag + per-item photos
   - Progress + submit gate when 100%
   - KS overall evaluation form before submit
3. Logging:
   - Write `qc_logs` for status/note/photo/item actions.

## Pending (Phase 3 - TPTC Flow)
- Review screen, approve/reject flow, lock after approve, notifications.

## Execution Rules (to avoid stalls)
- Work in short batches; report after each batch.
- No long blocking runs without status updates.
- If blocked by env/policy, report immediately + provide exact fallback command.
