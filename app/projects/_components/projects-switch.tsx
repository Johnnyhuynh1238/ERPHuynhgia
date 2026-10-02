"use client";

import { ProjectsClient } from "./projects-client";
import { PipelineClient } from "./pipeline-client";

// Admin → màn Dự án theo tiến độ 6 giai đoạn (PC + mobile). Các vai trò khác giữ màn cũ.
export function ProjectsSwitch({ currentRole }: { currentRole: string }) {
  if (currentRole !== "admin") return <ProjectsClient currentRole={currentRole} />;
  return <PipelineClient />;
}
