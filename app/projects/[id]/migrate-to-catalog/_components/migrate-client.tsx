"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type Catalog = {
  id: string;
  phaseCode: string;
  taskCode: string;
  phaseName: string;
  taskName: string;
};

type ProjectPhase = {
  id: string;
  code: string;
  name: string;
  displayOrder: number;
  status: string;
};

type ApiTask = {
  id: string;
  code: string;
  name: string;
  phase: string;
  status: string;
  team: string | null;
  inspectorName: string | null;
  displayOrder: number | null;
  stdPhaseCode: string | null;
  stdTaskCode: string | null;
  stdCatalogId: string | null;
  projectPhase: { id: string; code: string; name: string; displayOrder: number } | null;
};

type Mapping = {
  stdCatalogId: string | null;
  syncFields: boolean;
};

const SYNCABLE_STATUSES = new Set(["not_started"]);

function normalize(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function scoreMatch(taskName: string, taskCode: string, catalog: Catalog) {
  const taskTokens = new Set(normalize(taskName));
  const catalogTokens = new Set(normalize(catalog.taskName));
  let common = 0;
  taskTokens.forEach((token) => {
    if (catalogTokens.has(token)) common += 1;
  });
  const denom = Math.max(taskTokens.size, catalogTokens.size, 1);
  let score = common / denom;
  // bonus if task code looks like catalog code
  if (taskCode.includes(`${catalog.phaseCode}-${catalog.taskCode}`)) score += 0.5;
  return score;
}

function suggestCatalog(task: ApiTask, catalog: Catalog[]): Catalog | null {
  let best: Catalog | null = null;
  let bestScore = 0;
  for (const row of catalog) {
    const score = scoreMatch(task.name, task.code, row);
    if (score > bestScore) {
      best = row;
      bestScore = score;
    }
  }
  return bestScore >= 0.25 ? best : null;
}

const STATUS_LABEL: Record<string, string> = {
  not_started: "Chưa bắt đầu",
  in_progress: "Đang chạy",
  done: "Xong",
  internal_approved: "KS duyệt",
  completed: "Hoàn thành",
  inspected: "Đã NT",
  delayed: "Trễ",
  na: "N/A",
};

const STATUS_COLOR: Record<string, string> = {
  not_started: "bg-[#2a2a2a] text-[#aaa]",
  in_progress: "bg-[#1a3a5a] text-[#60a5fa]",
  done: "bg-[#1a3a1a] text-[#86efac]",
  internal_approved: "bg-[#1a3a1a] text-[#86efac]",
  completed: "bg-[#1a3a1a] text-[#86efac]",
  inspected: "bg-[#1a3a1a] text-[#86efac]",
  delayed: "bg-[#3a1a05] text-[#fb923c]",
  na: "bg-[#2a2a2a] text-[#7d7d7d]",
};

export function MigrateClient({
  projectId,
  projectName,
  projectCode,
}: {
  projectId: string;
  projectName: string;
  projectCode: string;
}) {
  const [tasks, setTasks] = useState<ApiTask[]>([]);
  const [catalog, setCatalog] = useState<Catalog[]>([]);
  const [phases, setPhases] = useState<ProjectPhase[]>([]);
  const [mappings, setMappings] = useState<Record<string, Mapping>>({});
  const [phaseRenames, setPhaseRenames] = useState<Record<string, { code: string; name: string }>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/projects/${projectId}/catalog-migrate`, { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      toast.error(json.message || "Không tải được");
      return;
    }
    const fetchedTasks = (json.tasks || []) as ApiTask[];
    setTasks(fetchedTasks);
    setCatalog((json.catalog || []) as Catalog[]);
    setPhases((json.phases || []) as ProjectPhase[]);

    const initial: Record<string, Mapping> = {};
    fetchedTasks.forEach((task) => {
      initial[task.id] = {
        stdCatalogId: task.stdCatalogId,
        syncFields: SYNCABLE_STATUSES.has(task.status) && !task.stdCatalogId,
      };
    });
    setMappings(initial);
    setPhaseRenames({});
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const catalogByPhase = useMemo(() => {
    const map = new Map<string, Catalog[]>();
    catalog.forEach((row) => {
      const list = map.get(row.phaseCode) || [];
      list.push(row);
      map.set(row.phaseCode, list);
    });
    return map;
  }, [catalog]);

  const grouped = useMemo(() => {
    const groups = new Map<string, { phase: ProjectPhase | null; tasks: ApiTask[] }>();
    tasks.forEach((task) => {
      const key = task.projectPhase?.id || "_none";
      const existing = groups.get(key);
      if (!existing) {
        groups.set(key, { phase: task.projectPhase as ProjectPhase | null, tasks: [task] });
      } else {
        existing.tasks.push(task);
      }
    });
    return Array.from(groups.values()).sort(
      (a, b) => (a.phase?.displayOrder ?? 999) - (b.phase?.displayOrder ?? 999),
    );
  }, [tasks]);

  function setMapping(taskId: string, patch: Partial<Mapping>) {
    setMappings((prev) => ({ ...prev, [taskId]: { ...prev[taskId], ...patch } }));
  }

  function autoSuggestAll() {
    let suggested = 0;
    const next = { ...mappings };
    tasks.forEach((task) => {
      if (next[task.id]?.stdCatalogId) return; // skip already mapped
      const best = suggestCatalog(task, catalog);
      if (best) {
        next[task.id] = {
          stdCatalogId: best.id,
          syncFields: SYNCABLE_STATUSES.has(task.status),
        };
        suggested += 1;
      }
    });
    setMappings(next);
    toast.success(`Đã gợi ý ${suggested} công tác`);
  }

  function autoSuggestOne(task: ApiTask) {
    const best = suggestCatalog(task, catalog);
    if (!best) {
      toast.error("Không tìm thấy gợi ý phù hợp");
      return;
    }
    setMapping(task.id, { stdCatalogId: best.id });
  }

  async function save() {
    const payloadMappings = Object.entries(mappings).map(([taskId, m]) => ({
      taskId,
      stdCatalogId: m.stdCatalogId,
      syncFields: m.syncFields,
    }));

    const payloadRenames = Object.entries(phaseRenames)
      .filter(([_, rename]) => rename.code.trim() && rename.name.trim())
      .map(([phaseId, rename]) => ({ phaseId, newCode: rename.code.trim(), newName: rename.name.trim() }));

    setSaving(true);
    const res = await fetch(`/api/projects/${projectId}/catalog-migrate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mappings: payloadMappings, phaseRenames: payloadRenames }),
    });
    setSaving(false);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(json.message || "Lưu thất bại");
      return;
    }
    toast.success(
      `Đã map ${json.mappedCount} | sync ${json.syncedCount} | bỏ qua locked ${json.skippedLocked}`,
    );
    load();
  }

  const totalMapped = Object.values(mappings).filter((m) => m.stdCatalogId).length;
  const totalSync = Object.values(mappings).filter(
    (m) => m.stdCatalogId && m.syncFields,
  ).length;

  if (loading) return <div className="text-center text-[#aaa] py-8">Đang tải…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <Link href={`/projects/${projectId}`} className="text-xs text-[#7d7d7d] hover:text-[#aaa]">
            ← Về dự án
          </Link>
          <h1 className="text-xl font-bold text-[#f0f2ff] mt-1">
            Chuẩn hoá theo danh mục chuẩn
          </h1>
          <p className="text-xs text-[#9ca3af] mt-1">
            <span className="font-mono">{projectCode}</span> · {projectName} · {tasks.length} công tác
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            onClick={autoSuggestAll}
            className="bg-[#1a1a1a] text-[#aaa] border border-[#2a2a2a] hover:border-[#f97316]"
          >
            Gợi ý tự động
          </Button>
          <Button
            type="button"
            onClick={save}
            disabled={saving}
            className="bg-[#f97316] text-black hover:bg-[#fb923c]"
          >
            {saving ? "Đang lưu…" : `Lưu (${totalMapped} map / ${totalSync} sync)`}
          </Button>
        </div>
      </div>

      <div className="rounded-xl bg-[#1a1a1a] border border-[#2a2a2a] p-3 text-xs text-[#9ca3af]">
        <div className="font-semibold text-[#e5e5e5] mb-1">Quy tắc</div>
        <ul className="list-disc list-inside space-y-0.5">
          <li>Task đã chạy (status ≠ chưa bắt đầu) → chỉ map mã, KHÔNG đụng vào dữ liệu task</li>
          <li>Task chưa bắt đầu + bật &quot;Sync&quot; → đồng bộ tên, team, vật tư, QC… từ catalog (chỉ field nào catalog có)</li>
          <li>Mã <span className="font-mono text-[#e0b855]">GĐ-CT</span> là danh tính vĩnh viễn</li>
        </ul>
      </div>

      {/* Phase rename panel */}
      <div className="rounded-xl bg-[#1a1a1a] border border-[#2a2a2a] p-3">
        <div className="text-xs font-semibold text-[#e5e5e5] mb-2">Đổi tên giai đoạn (chỉ giai đoạn chưa bắt đầu)</div>
        <div className="grid gap-2">
          {phases.map((phase) => {
            const locked = phase.status !== "not_started";
            const rename = phaseRenames[phase.id] || { code: phase.code, name: phase.name };
            return (
              <div
                key={phase.id}
                className={`flex items-center gap-2 text-xs ${locked ? "opacity-50" : ""}`}
              >
                <span className="text-[#7d7d7d] w-24">
                  {locked ? "🔒 " : ""}#{phase.displayOrder}
                </span>
                <input
                  value={rename.code}
                  disabled={locked}
                  onChange={(event) =>
                    setPhaseRenames((prev) => ({
                      ...prev,
                      [phase.id]: { ...rename, code: event.target.value },
                    }))
                  }
                  className="w-20 bg-[#0d0d0d] border border-[#2a2a2a] rounded px-2 py-1 font-mono text-[#e0b855] disabled:bg-[#1a1a1a]"
                />
                <input
                  value={rename.name}
                  disabled={locked}
                  onChange={(event) =>
                    setPhaseRenames((prev) => ({
                      ...prev,
                      [phase.id]: { ...rename, name: event.target.value },
                    }))
                  }
                  className="flex-1 bg-[#0d0d0d] border border-[#2a2a2a] rounded px-2 py-1 text-[#e5e5e5] disabled:bg-[#1a1a1a]"
                />
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-6">
        {grouped.map((group) => (
          <section key={group.phase?.id || "_none"}>
            <h2 className="text-sm font-semibold text-[#e0b855] mb-2">
              {group.phase ? (
                <>
                  {group.phase.code} — {group.phase.name}{" "}
                  <span className="text-[#7d7d7d] font-normal">({group.tasks.length})</span>
                </>
              ) : (
                <>Không gắn giai đoạn ({group.tasks.length})</>
              )}
            </h2>
            <div className="overflow-x-auto rounded-xl border border-[#2a2a2a]">
              <table className="w-full text-xs">
                <thead className="bg-[#1a1a1a] text-[#9ca3af]">
                  <tr>
                    <th className="px-2 py-2 text-left w-20">Mã cũ</th>
                    <th className="px-2 py-2 text-left">Tên công tác (hiện tại)</th>
                    <th className="px-2 py-2 text-left w-24">Trạng thái</th>
                    <th className="px-2 py-2 text-left w-72">→ Map vào catalog</th>
                    <th className="px-2 py-2 text-center w-16">Sync</th>
                    <th className="px-2 py-2 text-right w-20">Auto</th>
                  </tr>
                </thead>
                <tbody>
                  {group.tasks.map((task) => {
                    const mapping = mappings[task.id] || { stdCatalogId: null, syncFields: false };
                    const isSyncable = SYNCABLE_STATUSES.has(task.status);
                    const mappedCatalog = mapping.stdCatalogId
                      ? catalog.find((c) => c.id === mapping.stdCatalogId)
                      : null;
                    const phaseGroupRows = group.phase?.code
                      ? catalogByPhase.get(group.phase.code) || catalog
                      : catalog;
                    // Always show full catalog list if no phase match, else prioritize same phase
                    return (
                      <tr key={task.id} className="border-t border-[#2a2a2a]">
                        <td className="px-2 py-2 font-mono text-[#aaa]">{task.code}</td>
                        <td className="px-2 py-2 text-[#e5e5e5]">{task.name}</td>
                        <td className="px-2 py-2">
                          <span
                            className={`inline-block rounded px-1.5 py-0.5 text-[10px] ${STATUS_COLOR[task.status] || "bg-[#2a2a2a] text-[#aaa]"}`}
                          >
                            {isSyncable ? "" : "🔒 "}
                            {STATUS_LABEL[task.status] || task.status}
                          </span>
                        </td>
                        <td className="px-2 py-2">
                          <select
                            value={mapping.stdCatalogId || ""}
                            onChange={(event) =>
                              setMapping(task.id, { stdCatalogId: event.target.value || null })
                            }
                            className="w-full bg-[#0d0d0d] border border-[#2a2a2a] rounded px-2 py-1 text-[#e5e5e5]"
                          >
                            <option value="">— chưa map —</option>
                            <optgroup label={group.phase ? `GĐ ${group.phase.code}` : "Cùng GĐ"}>
                              {phaseGroupRows.map((row) => (
                                <option key={row.id} value={row.id}>
                                  {row.phaseCode}-{row.taskCode} · {row.taskName}
                                </option>
                              ))}
                            </optgroup>
                            <optgroup label="Toàn bộ catalog">
                              {catalog.map((row) => (
                                <option key={`all-${row.id}`} value={row.id}>
                                  {row.phaseCode}-{row.taskCode} · {row.taskName}
                                </option>
                              ))}
                            </optgroup>
                          </select>
                          {mappedCatalog && mappedCatalog.phaseCode !== group.phase?.code ? (
                            <div className="text-[10px] text-[#fb923c] mt-0.5">
                              ⚠ Khác GĐ với giai đoạn dự án ({mappedCatalog.phaseCode})
                            </div>
                          ) : null}
                        </td>
                        <td className="px-2 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={mapping.syncFields}
                            disabled={!isSyncable || !mapping.stdCatalogId}
                            onChange={(event) => setMapping(task.id, { syncFields: event.target.checked })}
                            className="accent-[#f97316] disabled:opacity-30"
                          />
                        </td>
                        <td className="px-2 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => autoSuggestOne(task)}
                            className="text-[10px] px-2 py-1 rounded border border-[#2a2a2a] text-[#aaa] hover:border-[#f97316] hover:text-[#f97316]"
                          >
                            Gợi ý
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
