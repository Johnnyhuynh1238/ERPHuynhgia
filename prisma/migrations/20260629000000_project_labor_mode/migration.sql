-- Add ProjectLaborMode enum + Project.labor_mode column
CREATE TYPE "ProjectLaborMode" AS ENUM ('self', 'subcontract');

ALTER TABLE "projects"
  ADD COLUMN "labor_mode" "ProjectLaborMode" NOT NULL DEFAULT 'self';
