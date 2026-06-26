"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";

export function ProjectBackLink({ projectId, projectName }: { projectId: string; projectName: string }) {
  const pathname = usePathname() ?? "";
  const onHub = pathname === `/projects/${projectId}`;
  const href = onHub ? "/projects" : `/projects/${projectId}`;
  const label = onHub ? "Tất cả dự án" : projectName;

  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 rounded-lg bg-[#0f1220] px-2.5 py-1.5 text-xs font-medium text-[#8892b0] ring-1 ring-[#252840] hover:text-white"
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      <span className="max-w-[200px] truncate">{label}</span>
    </Link>
  );
}
