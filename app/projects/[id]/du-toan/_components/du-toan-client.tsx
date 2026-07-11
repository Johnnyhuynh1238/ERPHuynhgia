"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, type Category, type CatalogTask } from "./du-toan-data";
import { KhoanTab } from "./khoan-tab";
import { VatTuTab } from "./vat-tu-tab";

type TabKey = "khoan" | "vat-tu";
const TABS: { key: TabKey; label: string }[] = [
  { key: "khoan", label: "Khoán" },
  { key: "vat-tu", label: "Vật tư" },
];

export function DuToanClient({
  projectId,
  projectCode,
  projectName,
  initialTab,
}: {
  projectId: string;
  projectCode: string;
  projectName: string;
  initialTab?: string;
}) {
  const valid = TABS.some((t) => t.key === initialTab);
  const [tab, setTab] = useState<TabKey>(valid ? (initialTab as TabKey) : "khoan");
  const [categories, setCategories] = useState<Category[]>([]);
  const [tasks, setTasks] = useState<CatalogTask[]>([]);
  const [metaErr, setMetaErr] = useState<string | null>(null);

  useEffect(() => {
    api
      .meta(projectId)
      .then((m) => {
        setCategories(m.categories);
        setTasks(m.tasks);
      })
      .catch((e) => setMetaErr(e.message));
  }, [projectId]);

  const selectTab = (key: TabKey) => {
    setTab(key);
    window.history.replaceState(null, "", `/projects/${projectId}/du-toan?tab=${key}`);
  };

  return (
    <div className="mx-auto max-w-6xl px-3 py-4 md:px-4">
      <div className="mb-3 flex items-center justify-between">
        <Link href={`/projects/${projectId}`} className="text-sm text-slate-500 hover:text-slate-800">
          ← Dự án
        </Link>
        <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
          Dự toán · {projectCode}
        </span>
      </div>

      <h1 className="text-xl font-bold text-slate-900">{projectName}</h1>
      <p className="mt-0.5 text-sm text-slate-500">
        Kho DB dự toán — khoán nhân công + vật tư theo công tác. AI bóc &amp; ghi, ERP hiển thị theo bộ lọc.
      </p>

      {metaErr && (
        <div className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          Lỗi tải danh mục: {metaErr}
        </div>
      )}

      <div className="mt-4 flex gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => selectTab(t.key)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition ${
              tab === t.key
                ? "border-slate-900 text-slate-900"
                : "border-transparent text-slate-400 hover:text-slate-600"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {tab === "khoan" && <KhoanTab projectId={projectId} />}
        {tab === "vat-tu" && <VatTuTab projectId={projectId} categories={categories} tasks={tasks} />}
      </div>
    </div>
  );
}
