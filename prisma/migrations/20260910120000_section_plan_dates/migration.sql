-- Tiến độ DỰ KIẾN: khoảng ngày kế hoạch mỗi PHẦN (để so với tiến độ thực tế).
ALTER TABLE "project_sections" ADD COLUMN "plan_start" DATE;
ALTER TABLE "project_sections" ADD COLUMN "plan_end" DATE;
