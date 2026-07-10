"use client";

import Link from "next/link";
import { useState } from "react";
import { KhoanTab } from "./khoan-tab";
import { KhoiLuongTab } from "./khoi-luong-tab";
import { VatTuTab } from "./vat-tu-tab";

type TabKey = "khoi-luong" | "vat-tu" | "khoan";

const TABS: { key: TabKey; label: string; short: string }[] = [
  { key: "khoi-luong", label: "Khối lượng", short: "KL" },
  { key: "vat-tu", label: "Vật tư", short: "VT" },
  { key: "khoan", label: "Khoán", short: "Khoán" },
];

type Props = {
  projectId: string;
  projectCode: string;
  projectName: string;
  initialTab?: string;
};

export function EstimateClient({ projectId, projectCode, projectName, initialTab }: Props) {
  const valid = TABS.some((t) => t.key === initialTab);
  const [tab, setTab] = useState<TabKey>(valid ? (initialTab as TabKey) : "khoi-luong");

  const selectTab = (key: TabKey) => {
    setTab(key);
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
            <h1 className="text-base font-bold text-zinc-100">Dự toán</h1>
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

      {tab === "khoi-luong" && <KhoiLuongTab projectId={projectId} />}
      {tab === "vat-tu" && <VatTuTab projectId={projectId} />}
      {tab === "khoan" && <KhoanTab projectId={projectId} />}
    </div>
  );
}
