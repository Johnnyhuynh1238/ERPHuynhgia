-- CreateTable
CREATE TABLE "design_photo_groups" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "visible_to_customer" BOOLEAN NOT NULL DEFAULT false,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "design_photo_groups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "design_photo_groups_project_id_display_order_idx" ON "design_photo_groups"("project_id", "display_order");

-- CreateIndex
CREATE INDEX "design_photo_groups_project_id_visible_to_customer_idx" ON "design_photo_groups"("project_id", "visible_to_customer");

-- AddForeignKey
ALTER TABLE "design_photo_groups" ADD CONSTRAINT "design_photo_groups_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "design_photo_groups" ADD CONSTRAINT "design_photo_groups_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "design_photo_group_access" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "group_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "granted_by" UUID NOT NULL,
    "granted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "design_photo_group_access_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "design_photo_group_access_group_id_user_id_key" ON "design_photo_group_access"("group_id", "user_id");

-- CreateIndex
CREATE INDEX "design_photo_group_access_user_id_idx" ON "design_photo_group_access"("user_id");

-- AddForeignKey
ALTER TABLE "design_photo_group_access" ADD CONSTRAINT "design_photo_group_access_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "design_photo_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "design_photo_group_access" ADD CONSTRAINT "design_photo_group_access_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "design_photo_group_access" ADD CONSTRAINT "design_photo_group_access_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "design_photos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "group_id" UUID NOT NULL,
    "photo_url" TEXT NOT NULL,
    "thumbnail_url" TEXT NOT NULL,
    "caption" TEXT,
    "file_size_kb" INTEGER NOT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "uploaded_by" UUID NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "design_photos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "design_photos_group_id_display_order_idx" ON "design_photos"("group_id", "display_order");

-- CreateIndex
CREATE INDEX "design_photos_group_id_uploaded_at_idx" ON "design_photos"("group_id", "uploaded_at");

-- AddForeignKey
ALTER TABLE "design_photos" ADD CONSTRAINT "design_photos_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "design_photo_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "design_photos" ADD CONSTRAINT "design_photos_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
