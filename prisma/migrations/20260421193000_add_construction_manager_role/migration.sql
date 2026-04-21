-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'construction_manager';

-- AlterEnum
ALTER TYPE "ProjectMemberRole" ADD VALUE IF NOT EXISTS 'construction_manager';
