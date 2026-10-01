"use client";

import { useEffect, useState } from "react";
import { ProjectsClient } from "./projects-client";
import { PipelineClient } from "./pipeline-client";

// Admin trên PC → màn Dự án theo tiến độ 6 giai đoạn. Mobile và các vai trò khác giữ màn cũ.
export function ProjectsSwitch({ currentRole }: { currentRole: string }) {
  const isAdmin = currentRole === "admin";
  const [desktop, setDesktop] = useState<boolean | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    const mq = window.matchMedia("(min-width: 1024px)");
    const apply = () => setDesktop(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [isAdmin]);

  if (!isAdmin) return <ProjectsClient currentRole={currentRole} />;
  if (desktop === null) return null;
  return desktop ? <PipelineClient /> : <ProjectsClient currentRole={currentRole} />;
}
