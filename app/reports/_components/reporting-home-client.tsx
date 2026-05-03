"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";

type ReportProject = {
  id: string;
  code: string;
  name: string;
  goLiveDate: string | null;
};

function formatDate(dateIso: string | null) {
  if (!dateIso) return "-";
  const d = new Date(dateIso);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

export function ReportingHomeClient({ projects }: { projects: ReportProject[] }) {
  const sorted = useMemo(
    () => [...projects].sort((a, b) => a.code.localeCompare(b.code, "vi")),
    [projects],
  );

  if (sorted.length === 0) {
    return (
      <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4 text-sm text-[#8892b0]">
        Không có dự án phù hợp để lập báo cáo.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
        <h2 className="text-lg font-bold text-[#f0f2ff]">Danh sách dự án báo cáo</h2>
        <p className="mt-1 text-sm text-[#8892b0]">Chọn dự án để vào báo cáo sáng hoặc báo cáo chiều.</p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {sorted.map((project) => (
          <div key={project.id} className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
            <div className="text-xs text-[#8892b0]">{project.code}</div>
            <div className="font-semibold">{project.name}</div>
            <div className="mt-2 text-xs text-[#8892b0]">Go-live: {formatDate(project.goLiveDate)}</div>
            <div className="mt-3 flex gap-2">
              <Link href={`/reports/${project.id}?tab=morning`}>
                <Button variant="outline">Báo cáo sáng</Button>
              </Link>
              <Link href={`/reports/${project.id}?tab=evening`}>
                <Button variant="outline">Báo cáo chiều</Button>
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
