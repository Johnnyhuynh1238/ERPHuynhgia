-- CreateEnum
CREATE TYPE "ProjectChangeDraftMode" AS ENUM ('create_project', 'update_project');

-- CreateEnum
CREATE TYPE "ProjectChangeDraftStatus" AS ENUM ('draft', 'ready', 'applied', 'archived');

-- CreateEnum
CREATE TYPE "ProjectDraftFileKind" AS ENUM ('contract', 'estimate', 'drawing', 'appendix', 'other');

-- CreateEnum
CREATE TYPE "ProjectAiRunStatus" AS ENUM ('pending', 'running', 'done', 'failed');

-- CreateEnum
CREATE TYPE "ProjectAiProposalSection" AS ENUM ('owner', 'project', 'assignment', 'payment', 'drawing', 'document');

-- CreateEnum
CREATE TYPE "ProjectAiProposalAction" AS ENUM ('fill_empty', 'supplement', 'warning_only');

-- CreateEnum
CREATE TYPE "ProjectAiConflictType" AS ENUM ('mismatch', 'ambiguous', 'format', 'validation', 'existing_value');

-- CreateEnum
CREATE TYPE "ProjectAiConflictResolution" AS ENUM ('manual_pending', 'accepted', 'rejected', 'ignored');

-- CreateEnum
CREATE TYPE "ProjectAiAuditAction" AS ENUM ('create_draft', 'save_draft', 'upload_file', 'delete_file', 'run_ai', 'apply_proposal', 'reject_proposal', 'manual_edit', 'submit_create', 'submit_update', 'create_project', 'update_project');

-- CreateTable
CREATE TABLE "project_change_drafts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "mode" "ProjectChangeDraftMode" NOT NULL,
    "status" "ProjectChangeDraftStatus" NOT NULL DEFAULT 'draft',
    "project_id" UUID,
    "form_data" JSONB NOT NULL,
    "ai_summary" JSONB,
    "created_by" UUID NOT NULL,
    "updated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_change_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_draft_files" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "draft_id" UUID NOT NULL,
    "file_kind" "ProjectDraftFileKind" NOT NULL,
    "file_url" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "mime_type" TEXT NOT NULL,
    "uploaded_by" UUID NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_draft_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_ai_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "draft_id" UUID NOT NULL,
    "status" "ProjectAiRunStatus" NOT NULL DEFAULT 'pending',
    "model" TEXT NOT NULL,
    "prompt_version" TEXT NOT NULL,
    "raw_result" JSONB,
    "error" TEXT,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_ai_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_ai_proposals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "run_id" UUID NOT NULL,
    "section" "ProjectAiProposalSection" NOT NULL,
    "field_path" TEXT NOT NULL,
    "suggested_value" JSONB NOT NULL,
    "action" "ProjectAiProposalAction" NOT NULL,
    "confidence" DECIMAL(5,4),
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_ai_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_ai_conflicts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "run_id" UUID NOT NULL,
    "field_path" TEXT NOT NULL,
    "current_value" JSONB,
    "suggested_value" JSONB,
    "conflict_type" "ProjectAiConflictType" NOT NULL,
    "resolution" "ProjectAiConflictResolution" NOT NULL DEFAULT 'manual_pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "project_ai_conflicts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_ai_audits" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "draft_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "action" "ProjectAiAuditAction" NOT NULL,
    "payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_ai_audits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_change_drafts_project_id_status_updated_at_idx" ON "project_change_drafts"("project_id", "status", "updated_at");

-- CreateIndex
CREATE INDEX "project_change_drafts_created_by_status_updated_at_idx" ON "project_change_drafts"("created_by", "status", "updated_at");

-- CreateIndex
CREATE INDEX "project_draft_files_draft_id_uploaded_at_idx" ON "project_draft_files"("draft_id", "uploaded_at");

-- CreateIndex
CREATE INDEX "project_draft_files_file_kind_idx" ON "project_draft_files"("file_kind");

-- CreateIndex
CREATE INDEX "project_ai_runs_draft_id_created_at_idx" ON "project_ai_runs"("draft_id", "created_at");

-- CreateIndex
CREATE INDEX "project_ai_runs_status_created_at_idx" ON "project_ai_runs"("status", "created_at");

-- CreateIndex
CREATE INDEX "project_ai_proposals_run_id_section_idx" ON "project_ai_proposals"("run_id", "section");

-- CreateIndex
CREATE INDEX "project_ai_proposals_action_idx" ON "project_ai_proposals"("action");

-- CreateIndex
CREATE INDEX "project_ai_conflicts_run_id_resolution_idx" ON "project_ai_conflicts"("run_id", "resolution");

-- CreateIndex
CREATE INDEX "project_ai_conflicts_conflict_type_idx" ON "project_ai_conflicts"("conflict_type");

-- CreateIndex
CREATE INDEX "project_ai_audits_draft_id_created_at_idx" ON "project_ai_audits"("draft_id", "created_at");

-- CreateIndex
CREATE INDEX "project_ai_audits_actor_id_created_at_idx" ON "project_ai_audits"("actor_id", "created_at");

-- CreateIndex
CREATE INDEX "project_ai_audits_action_idx" ON "project_ai_audits"("action");

-- AddForeignKey
ALTER TABLE "project_change_drafts" ADD CONSTRAINT "project_change_drafts_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_change_drafts" ADD CONSTRAINT "project_change_drafts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_change_drafts" ADD CONSTRAINT "project_change_drafts_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_draft_files" ADD CONSTRAINT "project_draft_files_draft_id_fkey" FOREIGN KEY ("draft_id") REFERENCES "project_change_drafts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_draft_files" ADD CONSTRAINT "project_draft_files_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_ai_runs" ADD CONSTRAINT "project_ai_runs_draft_id_fkey" FOREIGN KEY ("draft_id") REFERENCES "project_change_drafts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_ai_proposals" ADD CONSTRAINT "project_ai_proposals_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "project_ai_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_ai_conflicts" ADD CONSTRAINT "project_ai_conflicts_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "project_ai_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_ai_audits" ADD CONSTRAINT "project_ai_audits_draft_id_fkey" FOREIGN KEY ("draft_id") REFERENCES "project_change_drafts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_ai_audits" ADD CONSTRAINT "project_ai_audits_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
