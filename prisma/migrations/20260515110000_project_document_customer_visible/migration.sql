-- Add per-document visibility flag for the customer portal.
ALTER TABLE "project_documents" ADD COLUMN "visible_to_customer" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "project_documents_project_id_visible_to_customer_idx" ON "project_documents" ("project_id", "visible_to_customer");
