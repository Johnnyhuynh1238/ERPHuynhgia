-- CreateEnum
CREATE TYPE "ProjectDocumentCategory" AS ENUM ('contract', 'estimate', 'drawing', 'legal', 'other');

-- CreateTable
CREATE TABLE "project_documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "category" "ProjectDocumentCategory" NOT NULL DEFAULT 'contract',
    "file_url" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "mime_type" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "uploaded_by" UUID NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_documents_project_id_category_idx" ON "project_documents"("project_id", "category");

-- CreateIndex
CREATE INDEX "project_documents_project_id_uploaded_at_idx" ON "project_documents"("project_id", "uploaded_at");

-- AddForeignKey
ALTER TABLE "project_documents" ADD CONSTRAINT "project_documents_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_documents" ADD CONSTRAINT "project_documents_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "project_document_access" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "document_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "granted_by" UUID NOT NULL,
    "granted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_document_access_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "project_document_access_document_id_user_id_key" ON "project_document_access"("document_id", "user_id");

-- CreateIndex
CREATE INDEX "project_document_access_user_id_idx" ON "project_document_access"("user_id");

-- AddForeignKey
ALTER TABLE "project_document_access" ADD CONSTRAINT "project_document_access_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "project_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_document_access" ADD CONSTRAINT "project_document_access_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_document_access" ADD CONSTRAINT "project_document_access_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "project_ai_analysis_cache" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "document_signature" TEXT NOT NULL,
    "raw_result" JSONB NOT NULL,
    "proposals" JSONB NOT NULL,
    "conflicts" JSONB NOT NULL,
    "model" TEXT NOT NULL,
    "prompt_version" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_ai_analysis_cache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "project_ai_analysis_cache_project_id_document_signature_key" ON "project_ai_analysis_cache"("project_id", "document_signature");

-- CreateIndex
CREATE INDEX "project_ai_analysis_cache_project_id_updated_at_idx" ON "project_ai_analysis_cache"("project_id", "updated_at");

-- AddForeignKey
ALTER TABLE "project_ai_analysis_cache" ADD CONSTRAINT "project_ai_analysis_cache_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
