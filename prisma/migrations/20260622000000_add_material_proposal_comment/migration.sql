-- CreateTable
CREATE TABLE "material_proposal_comments" (
    "id" UUID NOT NULL,
    "proposal_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "author_role" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "material_proposal_comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "material_proposal_comments_proposal_id_created_at_idx" ON "material_proposal_comments"("proposal_id", "created_at");

-- AddForeignKey
ALTER TABLE "material_proposal_comments" ADD CONSTRAINT "material_proposal_comments_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "material_proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_proposal_comments" ADD CONSTRAINT "material_proposal_comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
