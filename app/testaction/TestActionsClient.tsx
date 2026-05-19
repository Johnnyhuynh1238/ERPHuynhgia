"use client";

import { useEffect, useMemo, useState } from "react";
import { ACTION_GROUPS, ALL_ACTIONS } from "./actions";

type ActionState = {
  status: "untested" | "passed" | "failed";
  note: string;
  updatedAt: string;
};

const STORAGE_KEY = "erp-testaction-state-v1";

function loadState(): Record<string, ActionState> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, ActionState>;
  } catch {
    return {};
  }
}

function saveState(state: Record<string, ActionState>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function TestActionsClient() {
  const [state, setState] = useState<Record<string, ActionState>>({});
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(ACTION_GROUPS.map((g) => [g.key, true])),
  );
  const [openItems, setOpenItems] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState<"all" | "untested" | "passed" | "failed">("all");

  useEffect(() => {
    setState(loadState());
  }, []);

  const stats = useMemo(() => {
    const total = ALL_ACTIONS.length;
    const passed = ALL_ACTIONS.filter((a) => state[a.id]?.status === "passed").length;
    const failed = ALL_ACTIONS.filter((a) => state[a.id]?.status === "failed").length;
    const untested = total - passed - failed;
    return { total, passed, failed, untested };
  }, [state]);

  function updateStatus(id: string, status: ActionState["status"]) {
    setState((prev) => {
      const next = {
        ...prev,
        [id]: {
          status,
          note: prev[id]?.note ?? "",
          updatedAt: new Date().toISOString(),
        },
      };
      saveState(next);
      return next;
    });
  }

  function updateNote(id: string, note: string) {
    setState((prev) => {
      const next = {
        ...prev,
        [id]: {
          status: prev[id]?.status ?? "untested",
          note,
          updatedAt: new Date().toISOString(),
        },
      };
      saveState(next);
      return next;
    });
  }

  function clearAll() {
    if (!confirm("Xóa toàn bộ trạng thái test trên máy này?")) return;
    setState({});
    saveState({});
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `testaction-state-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function filterMatches(id: string): boolean {
    const s = state[id]?.status ?? "untested";
    if (filter === "all") return true;
    return s === filter;
  }

  function statusBadge(status: ActionState["status"]) {
    if (status === "passed") return <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">PASS</span>;
    if (status === "failed") return <span className="rounded bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700">FAIL</span>;
    return <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">Chưa test</span>;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">Test Action — ERP Huỳnh Gia</h1>
        <p className="text-sm text-slate-600">
          Danh sách kịch bản test đa chiều. Tick PASS/FAIL khi đã kiểm. Trạng thái lưu localStorage trên máy này.
        </p>
      </header>

      <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Tổng" value={stats.total} tone="slate" />
        <Stat label="PASS" value={stats.passed} tone="emerald" />
        <Stat label="FAIL" value={stats.failed} tone="rose" />
        <Stat label="Chưa test" value={stats.untested} tone="amber" />
      </section>

      <section className="flex flex-wrap items-center gap-2">
        <label className="text-sm font-medium text-slate-700">Lọc:</label>
        {(["all", "untested", "passed", "failed"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded border px-3 py-1 text-sm ${filter === f ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700"}`}
          >
            {f === "all" ? "Tất cả" : f === "untested" ? "Chưa test" : f === "passed" ? "PASS" : "FAIL"}
          </button>
        ))}
        <div className="ml-auto flex gap-2">
          <button onClick={exportJson} className="rounded border border-slate-300 bg-white px-3 py-1 text-sm">Export JSON</button>
          <button onClick={clearAll} className="rounded border border-rose-300 bg-rose-50 px-3 py-1 text-sm text-rose-700">Xóa state</button>
        </div>
      </section>

      <section className="space-y-4">
        {ACTION_GROUPS.map((group) => {
          const visibleItems = group.items.filter((item) => filterMatches(item.id));
          if (!visibleItems.length) return null;
          const isOpen = openGroups[group.key] ?? true;
          return (
            <div key={group.key} className="rounded-lg border border-slate-200 bg-white">
              <button
                onClick={() => setOpenGroups((o) => ({ ...o, [group.key]: !isOpen }))}
                className="flex w-full items-center justify-between px-4 py-3 text-left"
              >
                <span className="font-semibold text-slate-900">{group.title}</span>
                <span className="text-sm text-slate-500">{visibleItems.length} action {isOpen ? "▾" : "▸"}</span>
              </button>
              {isOpen && (
                <div className="divide-y divide-slate-100 border-t border-slate-100">
                  {visibleItems.map((item) => {
                    const s = state[item.id] ?? { status: "untested" as const, note: "", updatedAt: "" };
                    const isItemOpen = openItems[item.id] ?? false;
                    return (
                      <div key={item.id} className="px-4 py-3">
                        <div className="flex items-start gap-3">
                          <button
                            onClick={() => setOpenItems((o) => ({ ...o, [item.id]: !isItemOpen }))}
                            className="mt-0.5 text-xs text-slate-400"
                            aria-label="Mở/đóng"
                          >
                            {isItemOpen ? "▾" : "▸"}
                          </button>
                          <div className="flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono text-xs text-slate-500">{item.id}</span>
                              <span className="font-medium text-slate-900">{item.title}</span>
                              {statusBadge(s.status)}
                            </div>
                            <div className="text-sm text-slate-600">Ai làm: {item.actor}</div>

                            {isItemOpen && (
                              <div className="mt-3 space-y-3">
                                <div>
                                  <div className="text-xs font-semibold uppercase text-slate-500">Ai phải thấy gì</div>
                                  <ul className="mt-1 space-y-1">
                                    {item.fanout.map((f, i) => (
                                      <li key={i} className="text-sm">
                                        <span className="font-semibold text-slate-700">{f.role}:</span>{" "}
                                        <span className="text-slate-600">{f.expect}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>

                                <div className="flex flex-wrap gap-2">
                                  <button
                                    onClick={() => updateStatus(item.id, "passed")}
                                    className={`rounded border px-3 py-1 text-sm ${s.status === "passed" ? "border-emerald-600 bg-emerald-600 text-white" : "border-emerald-300 bg-emerald-50 text-emerald-700"}`}
                                  >
                                    PASS
                                  </button>
                                  <button
                                    onClick={() => updateStatus(item.id, "failed")}
                                    className={`rounded border px-3 py-1 text-sm ${s.status === "failed" ? "border-rose-600 bg-rose-600 text-white" : "border-rose-300 bg-rose-50 text-rose-700"}`}
                                  >
                                    FAIL
                                  </button>
                                  <button
                                    onClick={() => updateStatus(item.id, "untested")}
                                    className="rounded border border-slate-300 bg-white px-3 py-1 text-sm text-slate-600"
                                  >
                                    Reset
                                  </button>
                                </div>

                                <textarea
                                  value={s.note}
                                  onChange={(e) => updateNote(item.id, e.target.value)}
                                  placeholder="Ghi chú lỗi gặp phải, bước cụ thể, link bug..."
                                  className="w-full rounded border border-slate-300 p-2 text-sm"
                                  rows={2}
                                />

                                {s.updatedAt && (
                                  <div className="text-xs text-slate-400">
                                    Cập nhật: {new Date(s.updatedAt).toLocaleString("vi-VN")}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </section>

      <footer className="text-xs text-slate-400">
        State lưu localStorage trên máy này. Đổi máy → state không sync. Dùng &quot;Export JSON&quot; để backup.
      </footer>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "slate" | "emerald" | "rose" | "amber" }) {
  const colors: Record<string, string> = {
    slate: "bg-slate-50 text-slate-700",
    emerald: "bg-emerald-50 text-emerald-700",
    rose: "bg-rose-50 text-rose-700",
    amber: "bg-amber-50 text-amber-700",
  };
  return (
    <div className={`rounded-lg p-3 text-center ${colors[tone]}`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs uppercase tracking-wide">{label}</div>
    </div>
  );
}
