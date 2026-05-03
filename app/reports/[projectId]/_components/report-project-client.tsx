"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { EveningTab } from "@/app/reports/[projectId]/_components/evening-tab";
import { MorningTab } from "@/app/reports/[projectId]/_components/morning-tab";

type TabKey = "morning" | "evening";

export function ReportProjectClient({ projectId, projectCode, projectName }: { projectId: string; projectCode: string; projectName: string }) {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab") === "evening" ? "evening" : "morning";
  const [tab, setTab] = useState<TabKey>(initialTab);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[#2f3555] bg-[#171c2f] p-4">
        <div className="text-lg font-bold text-[#f0f2ff]">Báo cáo - {projectCode}</div>
        <div className="mt-1 text-sm text-[#98a0c2]">{projectName}</div>

        <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-[#10152a] p-1.5">
          <button
            type="button"
            onClick={() => setTab("morning")}
            className={`rounded-lg px-3 py-2 text-sm font-semibold ${tab === "morning" ? "bg-[#f97316] text-white" : "text-[#98a0c2]"}`}
          >
            ☀️ Báo cáo sáng
          </button>
          <button
            type="button"
            onClick={() => setTab("evening")}
            className={`rounded-lg px-3 py-2 text-sm font-semibold ${tab === "evening" ? "bg-[#f97316] text-white" : "text-[#98a0c2]"}`}
          >
            🌆 Cập nhật chiều
          </button>
        </div>
      </div>

      {tab === "morning" ? <MorningTab projectId={projectId} /> : <EveningTab projectId={projectId} />}
    </div>
  );
}
