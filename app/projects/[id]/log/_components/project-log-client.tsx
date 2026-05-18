"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type LogRow = {
  id: string;
  createdAt: string;
  entity: string;
  entityLabel: string;
  action: string;
  actionLabel: string;
  summary: string;
  diff: Record<string, { from: unknown; to: unknown }> | null;
  snapshot: unknown;
  metadata: Record<string, unknown> | null;
  actor: { id: string; name: string } | null;
};

type Props = {
  projectId: string;
  projectCode: string;
  projectName: string;
  page: number;
  totalPages: number;
  total: number;
  rows: LogRow[];
  actors: { id: string; name: string }[];
  entities: { value: string; label: string }[];
  actions: { value: string; label: string }[];
  filters: { entity: string; action: string; actor: string; from: string; to: string };
};

function fmtDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtVal(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (v === "") return '""';
  if (typeof v === "boolean") return v ? "có" : "không";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export function ProjectLogClient(props: Props) {
  const router = useRouter();
  const sp = useSearchParams();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const [entity, setEntity] = useState(props.filters.entity);
  const [action, setAction] = useState(props.filters.action);
  const [actor, setActor] = useState(props.filters.actor);
  const [from, setFrom] = useState(props.filters.from);
  const [to, setTo] = useState(props.filters.to);

  const applyFilters = () => {
    const params = new URLSearchParams();
    if (entity) params.set("entity", entity);
    if (action) params.set("action", action);
    if (actor) params.set("actor", actor);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    router.push(`/projects/${props.projectId}/log${params.toString() ? `?${params}` : ""}`);
  };

  const clearFilters = () => {
    setEntity("");
    setAction("");
    setActor("");
    setFrom("");
    setTo("");
    router.push(`/projects/${props.projectId}/log`);
  };

  const goPage = (p: number) => {
    const params = new URLSearchParams(sp.toString());
    if (p <= 1) params.delete("page");
    else params.set("page", String(p));
    router.push(`/projects/${props.projectId}/log${params.toString() ? `?${params}` : ""}`);
  };

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
        <div className="text-sm text-[#8892b0]">
          Tổng <span className="text-[#f0f2ff] font-medium">{props.total.toLocaleString("vi-VN")}</span> hoạt động
        </div>

        <div className="mt-3 grid grid-cols-1 md:grid-cols-5 gap-2">
          <select
            value={entity}
            onChange={(e) => setEntity(e.target.value)}
            className="rounded-lg border border-[#2d3249] bg-[#13151f] px-3 py-2 text-xs text-[#f0f2ff]"
          >
            <option value="">Tất cả entity</option>
            {props.entities.map((e) => (
              <option key={e.value} value={e.value}>
                {e.label}
              </option>
            ))}
          </select>

          <select
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className="rounded-lg border border-[#2d3249] bg-[#13151f] px-3 py-2 text-xs text-[#f0f2ff]"
          >
            <option value="">Tất cả hành động</option>
            {props.actions.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>

          <select
            value={actor}
            onChange={(e) => setActor(e.target.value)}
            className="rounded-lg border border-[#2d3249] bg-[#13151f] px-3 py-2 text-xs text-[#f0f2ff]"
          >
            <option value="">Tất cả người dùng</option>
            {props.actors.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>

          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-lg border border-[#2d3249] bg-[#13151f] px-3 py-2 text-xs text-[#f0f2ff]"
          />

          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-lg border border-[#2d3249] bg-[#13151f] px-3 py-2 text-xs text-[#f0f2ff]"
          />
        </div>

        <div className="mt-3 flex gap-2">
          <button
            onClick={applyFilters}
            className="rounded-lg bg-[#f97316] px-4 py-2 text-xs font-medium text-white hover:bg-[#ea580c]"
          >
            Lọc
          </button>
          <button
            onClick={clearFilters}
            className="rounded-lg border border-[#2d3249] bg-[#13151f] px-4 py-2 text-xs font-medium text-[#8892b0] hover:bg-[#1a1d2e]"
          >
            Xoá lọc
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] overflow-hidden">
        {props.rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-[#8892b0]">Chưa có hoạt động nào</div>
        ) : (
          <div className="divide-y divide-[#252840]">
            {props.rows.map((row) => {
              const isOpen = expanded.has(row.id);
              const hasDetail = Boolean(row.diff || row.snapshot || row.metadata);
              return (
                <div key={row.id} className="p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="rounded-full bg-[#f97316]/15 px-2 py-0.5 text-[#fb923c]">
                          {row.entityLabel}
                        </span>
                        <span className="rounded-full bg-blue-500/15 px-2 py-0.5 text-blue-300">
                          {row.actionLabel}
                        </span>
                        <span className="text-[#8892b0]">{fmtDateTime(row.createdAt)}</span>
                        {row.actor && (
                          <span className="text-[#f0f2ff]">{row.actor.name}</span>
                        )}
                      </div>
                      <div className="mt-1 text-sm text-[#f0f2ff] break-words">{row.summary}</div>
                    </div>
                    {hasDetail && (
                      <button
                        onClick={() => toggle(row.id)}
                        className="shrink-0 rounded-lg border border-[#2d3249] px-2 py-1 text-xs text-[#8892b0] hover:bg-[#13151f]"
                      >
                        {isOpen ? "Ẩn" : "Chi tiết"}
                      </button>
                    )}
                  </div>

                  {isOpen && hasDetail && (
                    <div className="mt-2 rounded-lg border border-[#252840] bg-[#13151f] p-3 text-xs space-y-2">
                      {row.diff && Object.keys(row.diff).length > 0 && (
                        <div>
                          <div className="text-[#8892b0] mb-1">Thay đổi:</div>
                          <div className="space-y-1">
                            {Object.entries(row.diff).map(([k, v]) => (
                              <div key={k} className="text-[#f0f2ff]">
                                <span className="text-[#fb923c]">{k}</span>:{" "}
                                <span className="line-through text-red-300">{fmtVal(v.from)}</span>
                                {" → "}
                                <span className="text-emerald-300">{fmtVal(v.to)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {row.snapshot !== null && row.snapshot !== undefined && (
                        <div>
                          <div className="text-[#8892b0] mb-1">Snapshot:</div>
                          <pre className="text-[#f0f2ff] whitespace-pre-wrap break-words">
                            {JSON.stringify(row.snapshot, null, 2)}
                          </pre>
                        </div>
                      )}
                      {row.metadata && Object.keys(row.metadata).length > 0 && (
                        <div>
                          <div className="text-[#8892b0] mb-1">Metadata:</div>
                          <pre className="text-[#f0f2ff] whitespace-pre-wrap break-words">
                            {JSON.stringify(row.metadata, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {props.totalPages > 1 && (
        <div className="flex items-center justify-between rounded-2xl border border-[#252840] bg-[#1a1d2e] p-3 text-xs">
          <div className="text-[#8892b0]">
            Trang {props.page} / {props.totalPages}
          </div>
          <div className="flex gap-2">
            <button
              disabled={props.page <= 1}
              onClick={() => goPage(props.page - 1)}
              className="rounded-lg border border-[#2d3249] px-3 py-1.5 text-[#f0f2ff] disabled:opacity-40 hover:bg-[#13151f]"
            >
              Trước
            </button>
            <button
              disabled={props.page >= props.totalPages}
              onClick={() => goPage(props.page + 1)}
              className="rounded-lg border border-[#2d3249] px-3 py-1.5 text-[#f0f2ff] disabled:opacity-40 hover:bg-[#13151f]"
            >
              Sau
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
