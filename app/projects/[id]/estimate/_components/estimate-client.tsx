"use client";

import Link from "next/link";
import { useState } from "react";
import { NormsClient } from "../../budget/norms/_components/norms-client";
import { PricesClient } from "../../budget/prices/_components/prices-client";
import { HaoPhiTab } from "./hao-phi-tab";
import { KhoiLuongTab } from "./khoi-luong-tab";
import { MoTaTab } from "./mo-ta-tab";

type TabKey = "mo-ta" | "khoi-luong" | "hp-vt" | "don-gia" | "dinh-muc" | "hp-nc";

const TABS: { key: TabKey; label: string; short: string }[] = [
  { key: "mo-ta", label: "Mô tả", short: "Mô tả" },
  { key: "khoi-luong", label: "Khối lượng", short: "KL" },
  { key: "hp-vt", label: "Hao phí vật tư", short: "HP VT" },
  { key: "don-gia", label: "Đơn giá", short: "Đơn giá" },
  { key: "dinh-muc", label: "Định mức", short: "ĐM" },
  { key: "hp-nc", label: "Hao phí NC + máy", short: "HP NC" },
];

type Props = {
  projectId: string;
  projectCode: string;
  projectName: string;
  initialTab?: string;
};

export function EstimateClient({ projectId, projectCode, projectName, initialTab }: Props) {
  const valid = TABS.some((t) => t.key === initialTab);
  const [tab, setTab] = useState<TabKey>(valid ? (initialTab as TabKey) : "mo-ta");

  const selectTab = (key: TabKey) => {
    setTab(key);
    // Giữ tab trong URL để reload/share không mất vị trí, không trigger navigation
    window.history.replaceState(null, "", `/projects/${projectId}/estimate?tab=${key}`);
  };

  return (
    <div className="mx-auto max-w-6xl space-y-3 px-0 py-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 sm:px-0">
        <div className="flex items-center gap-2">
          <Link
            href={`/projects/${projectId}`}
            className="rounded-full border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
          >
            ← Dự án
          </Link>
          <div>
            <h1 className="text-base font-bold text-zinc-100">Dự toán AI</h1>
            <p className="text-xs text-zinc-500">
              {projectCode} · {projectName}
            </p>
          </div>
        </div>
      </div>

      <div className="mx-3 flex gap-1 overflow-x-auto rounded-xl border border-[#252840] bg-[#13151f] p-1 sm:mx-0">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => selectTab(t.key)}
            className={`shrink-0 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
              tab === t.key
                ? "bg-[#f97316]/20 text-[#fb923c]"
                : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            }`}
          >
            <span className="hidden sm:inline">{t.label}</span>
            <span className="sm:hidden">{t.short}</span>
          </button>
        ))}
      </div>

      {tab === "mo-ta" && <MoTaTab projectId={projectId} />}
      {tab === "khoi-luong" && <KhoiLuongTab projectId={projectId} />}
      {tab === "hp-vt" && <HaoPhiTab projectId={projectId} kind="vt" />}
      {tab === "don-gia" && <PricesClient projectId={projectId} canEdit initialTab="vt" />}
      {tab === "dinh-muc" && (
        <NormsClient projectId={projectId} projectName={projectName} projectCode={projectCode} canEdit />
      )}
      {tab === "hp-nc" && <HaoPhiTab projectId={projectId} kind="ncmm" />}
    </div>
  );
}
