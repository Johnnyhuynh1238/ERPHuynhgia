"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { TaskRow } from "../_lib/by-task";

type Props = {
  projectId: string;
  projectName: string;
  projectCode: string;
  rows: TaskRow[];
  totals: {
    materialAmount: number;
    laborAmount: number;
    machineAmount: number;
    grandTotal: number;
  };
};

function fmtVND(n: number) {
  return n.toLocaleString("vi-VN");
}
function fmtShort(n: number) {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + " tỷ";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + " tr";
  if (n >= 1_000) return Math.round(n / 1_000).toLocaleString("vi-VN") + " k";
  return n.toLocaleString("vi-VN");
}
function fmtNum(n: number) {
  if (Number.isInteger(n)) return n.toLocaleString("vi-VN");
  return n.toLocaleString("vi-VN", { maximumFractionDigits: 4 });
}

export function ByTaskClient({ projectId, projectName, projectCode, rows, totals }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const grouped = useMemo(() => {
    const map = new Map<string, Map<string, TaskRow[]>>();
    for (const r of rows) {
      const stage = r.stage ?? "—";
      let byComp = map.get(stage);
      if (!byComp) {
        byComp = new Map();
        map.set(stage, byComp);
      }
      let list = byComp.get(r.componentName);
      if (!list) {
        list = [];
        byComp.set(r.componentName, list);
      }
      list.push(r);
    }
    return map;
  }, [rows]);

  const taskCount = rows.length;
  const withNorm = rows.filter((r) => r.hasNorm && r.hasNormData).length;
  const withMissing = rows.filter((r) => r.materialHasMissing || r.laborHasMissing || r.machineHasMissing).length;

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-3 sm:p-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Dự toán</div>
          <h1 className="text-base font-semibold text-zinc-100 sm:text-lg">Giá theo công tác</h1>
          <div className="text-xs text-zinc-500">{projectName} · {projectCode}</div>
        </div>
        <Link
          href={`/projects/${projectId}/budget`}
          className="shrink-0 rounded-xl border border-[#252840] bg-[#1a1d2e] px-3 py-1.5 text-[11px] text-zinc-300 ring-1 ring-zinc-700 hover:border-sky-500/50 hover:text-sky-200"
        >
          ← Quay lại
        </Link>
      </div>

      {/* Summary card */}
      <div className="rounded-2xl border border-[#252840] bg-gradient-to-br from-[#1a1d2e] to-[#0f1220] p-4 ring-1 ring-orange-500/10">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Tổng giá vốn dự kiến</div>
            <div className="mt-1 text-2xl font-bold text-zinc-100 sm:text-3xl">
              {totals.grandTotal > 0 ? fmtVND(totals.grandTotal) + " đ" : "—"}
            </div>
          </div>
          <div className="text-right text-[11px] text-zinc-500">
            <div>{taskCount} công tác · {withNorm} có ĐM đủ</div>
            {withMissing > 0 && (
              <div className="text-amber-300">⚠ {withMissing} công tác thiếu đơn giá</div>
            )}
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[11px]">
          <div className="rounded-lg bg-emerald-500/10 px-2 py-1.5 ring-1 ring-emerald-500/30">
            <div className="font-medium text-emerald-200">📦 VT</div>
            <div className="text-emerald-300/80">{fmtShort(totals.materialAmount)}</div>
          </div>
          <div className="rounded-lg bg-amber-500/10 px-2 py-1.5 ring-1 ring-amber-500/30">
            <div className="font-medium text-amber-200">👥 NC</div>
            <div className="text-amber-300/80">{fmtShort(totals.laborAmount)}</div>
          </div>
          <div className="rounded-lg bg-violet-500/10 px-2 py-1.5 ring-1 ring-violet-500/30">
            <div className="font-medium text-violet-200">🏗 MM</div>
            <div className="text-violet-300/80">{fmtShort(totals.machineAmount)}</div>
          </div>
        </div>
      </div>

      {/* Group sections */}
      {Array.from(grouped.entries()).map(([stage, byComp]) => (
        <section key={stage} className="space-y-3">
          <div className="sticky top-0 z-10 -mx-3 bg-[#0b0d18] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-sky-300 sm:-mx-4 sm:px-4">
            ▸ Giai đoạn: {stage}
          </div>
          {Array.from(byComp.entries()).map(([comp, list]) => (
            <div key={comp} className="space-y-2">
              <div className="px-1 text-[11px] font-medium text-zinc-400">▪ {comp}</div>
              <div className="space-y-2">
                {list.map((r) => (
                  <TaskCard
                    key={r.id}
                    r={r}
                    projectId={projectId}
                    isOpen={expanded.has(r.id)}
                    onToggle={() => toggle(r.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </section>
      ))}

      <div className="text-center text-[10px] text-zinc-600">
        Bấm vào card để xem chi tiết công thức tính từng vật tư, công, ca máy.
      </div>
    </div>
  );
}

function TaskCard({
  r,
  projectId,
  isOpen,
  onToggle,
}: {
  r: TaskRow;
  projectId: string;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const canExpand = r.hasNorm && r.hasNormData;
  const hasMissing = r.materialHasMissing || r.laborHasMissing || r.machineHasMissing;

  return (
    <div className={`overflow-hidden rounded-2xl border border-[#252840] bg-[#1a1d2e] ring-1 ${isOpen ? "ring-sky-500/30" : "ring-zinc-800"}`}>
      <button
        type="button"
        onClick={canExpand ? onToggle : undefined}
        disabled={!canExpand}
        className={`block w-full px-3 py-2.5 text-left ${canExpand ? "active:bg-[#1d2238]" : "cursor-default"}`}
      >
        {/* Top row: name + ĐM code + toggle */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-medium leading-tight text-zinc-100">{r.name}</div>
            {r.normCode ? (
              <div className="mt-0.5 text-[10px] text-zinc-500">
                ĐM {r.normCode}{r.normUnit ? ` · ${r.normUnit}` : ""}
                {r.normName && <span className="text-zinc-600"> · {r.normName}</span>}
              </div>
            ) : (
              <div className="mt-0.5 text-[10px] text-amber-400">⚠ Chưa gắn ĐM</div>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {hasMissing && (
              <span className="rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-medium text-amber-200">
                ⚠ Thiếu giá
              </span>
            )}
            {canExpand && (
              <span className="text-zinc-500">{isOpen ? "▾" : "▸"}</span>
            )}
          </div>
        </div>

        {/* KL row */}
        <div className="mt-2 flex items-baseline gap-3 text-[11px] text-zinc-400">
          <span>KL: <span className="font-mono text-zinc-200">{fmtNum(r.quantity)}</span> <span className="text-zinc-500">{r.normUnit ?? ""}</span></span>
          {r.totalAmount > 0 && (
            <span className="ml-auto text-[12px]">
              Tổng: <span className="font-mono font-bold text-zinc-100">{fmtVND(r.totalAmount)} đ</span>
            </span>
          )}
        </div>

        {/* 3-color breakdown grid */}
        <div className="mt-2 grid grid-cols-3 gap-1.5 text-center text-[11px]">
          <div className={`rounded-lg px-2 py-1.5 ring-1 ${r.materialAmount > 0 ? "bg-emerald-500/10 ring-emerald-500/30" : "bg-zinc-800/30 ring-zinc-700/50"}`}>
            <div className="text-[10px] font-medium text-emerald-200/80">📦 VT</div>
            <div className={`font-mono ${r.materialAmount > 0 ? "text-emerald-200" : "text-zinc-600"}`}>
              {r.materialAmount > 0 ? fmtShort(r.materialAmount) : "—"}
              {r.materialHasMissing && <span className="ml-0.5 text-amber-400">⚠</span>}
            </div>
          </div>
          <div className={`rounded-lg px-2 py-1.5 ring-1 ${r.laborAmount > 0 ? "bg-amber-500/10 ring-amber-500/30" : "bg-zinc-800/30 ring-zinc-700/50"}`}>
            <div className="text-[10px] font-medium text-amber-200/80">👥 NC</div>
            <div className={`font-mono ${r.laborAmount > 0 ? "text-amber-200" : "text-zinc-600"}`}>
              {r.laborAmount > 0 ? fmtShort(r.laborAmount) : "—"}
              {r.laborHasMissing && <span className="ml-0.5 text-amber-400">⚠</span>}
            </div>
          </div>
          <div className={`rounded-lg px-2 py-1.5 ring-1 ${r.machineAmount > 0 ? "bg-violet-500/10 ring-violet-500/30" : "bg-zinc-800/30 ring-zinc-700/50"}`}>
            <div className="text-[10px] font-medium text-violet-200/80">🏗 MM</div>
            <div className={`font-mono ${r.machineAmount > 0 ? "text-violet-200" : "text-zinc-600"}`}>
              {r.machineAmount > 0 ? fmtShort(r.machineAmount) : "—"}
              {r.machineHasMissing && <span className="ml-0.5 text-amber-400">⚠</span>}
            </div>
          </div>
        </div>
      </button>

      {isOpen && canExpand && (
        <div className="border-t border-[#252840] bg-[#10131f] px-3 py-3">
          <ExpandDetail r={r} projectId={projectId} />
        </div>
      )}
    </div>
  );
}

function ExpandDetail({ r, projectId }: { r: TaskRow; projectId: string }) {
  return (
    <div className="space-y-3 text-[11px]">
      <div className="text-[10px] text-zinc-500">
        Công thức: <span className="font-mono text-zinc-400">KL × ĐM × K = Hao phí</span> → <span className="font-mono text-zinc-400">× Đơn giá = Thành tiền</span>
      </div>

      {r.materialLines.length > 0 && (
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-2">
          <div className="mb-1 flex items-center justify-between text-[11px] font-semibold text-emerald-200">
            <span>📦 Vật tư</span>
            <span className="font-mono">{r.materialAmount > 0 ? fmtVND(r.materialAmount) + " đ" : "—"}</span>
          </div>
          <ul className="space-y-1.5">
            {r.materialLines.map((m, i) => (
              <li key={i} className="break-words text-[11px] leading-relaxed text-zinc-300">
                <div className="text-[11px] font-medium text-zinc-100">{m.name} <span className="text-zinc-500">({m.unit})</span></div>
                <div className="font-mono text-[10.5px]">
                  {fmtNum(r.quantity)} × {fmtNum(m.qtyPerUnit)}
                  {m.k !== 1 && <> × {fmtNum(m.k)}</>}
                  {" = "}
                  <span className="text-emerald-200">{fmtNum(m.total)} {m.unit}</span>
                  {m.price != null && m.amount != null ? (
                    <>
                      <br />
                      <span className="text-zinc-500">× {fmtVND(m.price)} đ = </span>
                      <span className="font-semibold text-emerald-200">{fmtVND(m.amount)} đ</span>
                    </>
                  ) : (
                    <>
                      {" × "}
                      <Link href={`/projects/${projectId}/budget/prices?tab=vt`} className="text-amber-300 underline">
                        thiếu đơn giá
                      </Link>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {r.laborLines.length > 0 && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-2">
          <div className="mb-1 flex items-center justify-between text-[11px] font-semibold text-amber-200">
            <span>👥 Nhân công</span>
            <span className="font-mono">{r.laborAmount > 0 ? fmtVND(r.laborAmount) + " đ" : "—"}</span>
          </div>
          <ul className="space-y-1.5">
            {r.laborLines.map((l, i) => (
              <li key={i} className="break-words text-[11px] leading-relaxed text-zinc-300">
                <div className="text-[11px] font-medium text-zinc-100">Bậc {l.grade}</div>
                <div className="font-mono text-[10.5px]">
                  {fmtNum(r.quantity)} × {fmtNum(l.qtyPerUnit)}
                  {l.k !== 1 && <> × {fmtNum(l.k)}</>}
                  {" = "}
                  <span className="text-amber-200">{fmtNum(l.total)} công</span>
                  {l.price != null && l.amount != null ? (
                    <>
                      <br />
                      <span className="text-zinc-500">× {fmtVND(l.price)} đ = </span>
                      <span className="font-semibold text-amber-200">{fmtVND(l.amount)} đ</span>
                    </>
                  ) : (
                    <>
                      {" × "}
                      <Link href={`/projects/${projectId}/budget/prices?tab=nc`} className="text-amber-300 underline">
                        thiếu đơn giá
                      </Link>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {r.machineLines.length > 0 && (
        <div className="rounded-lg border border-violet-500/20 bg-violet-500/5 p-2">
          <div className="mb-1 flex items-center justify-between text-[11px] font-semibold text-violet-200">
            <span>🏗 Máy móc</span>
            <span className="font-mono">{r.machineAmount > 0 ? fmtVND(r.machineAmount) + " đ" : "—"}</span>
          </div>
          <ul className="space-y-1.5">
            {r.machineLines.map((m, i) => (
              <li key={i} className="break-words text-[11px] leading-relaxed text-zinc-300">
                <div className="text-[11px] font-medium text-zinc-100">{m.name}</div>
                <div className="font-mono text-[10.5px]">
                  {fmtNum(r.quantity)} × {fmtNum(m.qtyPerUnit)}
                  {m.k !== 1 && <> × {fmtNum(m.k)}</>}
                  {" = "}
                  <span className="text-violet-200">{fmtNum(m.total)} ca</span>
                  {m.price != null && m.amount != null ? (
                    <>
                      <br />
                      <span className="text-zinc-500">× {fmtVND(m.price)} đ = </span>
                      <span className="font-semibold text-violet-200">{fmtVND(m.amount)} đ</span>
                    </>
                  ) : (
                    <>
                      {" × "}
                      <Link href={`/projects/${projectId}/budget/prices?tab=mm`} className="text-amber-300 underline">
                        thiếu đơn giá
                      </Link>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center justify-between rounded-lg border border-zinc-700 bg-zinc-800/40 px-3 py-2">
        <span className="text-[11px] font-semibold text-zinc-300">Tổng công tác này</span>
        <span className="font-mono text-[13px] font-bold text-zinc-100">
          {r.totalAmount > 0 ? fmtVND(r.totalAmount) + " đ" : "—"}
        </span>
      </div>
    </div>
  );
}
