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

  const stageList = Array.from(grouped.keys());

  const flat: Array<{ kind: "stage"; stage: string } | { kind: "comp"; comp: string; rows: TaskRow[] }> = [];
  for (const stage of stageList) {
    flat.push({ kind: "stage", stage });
    const byComp = grouped.get(stage)!;
    for (const [comp, rs] of Array.from(byComp.entries())) {
      flat.push({ kind: "comp", comp, rows: rs });
    }
  }

  const taskCount = rows.length;
  const withNorm = rows.filter((r) => r.hasNorm && r.hasNormData).length;
  const withMissing = rows.filter((r) => r.materialHasMissing || r.laborHasMissing || r.machineHasMissing).length;

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-3 sm:p-4">
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

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-[#252840] bg-[#1a1d2e]">
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead className="bg-[#0f1220] text-[11px] uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="w-8 px-2 py-2"></th>
                <th className="px-2 py-2 text-left">Công tác</th>
                <th className="px-2 py-2 text-right">KL</th>
                <th className="px-2 py-2 text-left">ĐV</th>
                <th className="px-2 py-2 text-right text-emerald-300/80">VT (đ)</th>
                <th className="px-2 py-2 text-right text-amber-300/80">NC (đ)</th>
                <th className="px-2 py-2 text-right text-violet-300/80">MM (đ)</th>
                <th className="px-2 py-2 text-right">Tổng (đ)</th>
              </tr>
            </thead>
            <tbody>
              {flat.map((entry, idx) => {
                if (entry.kind === "stage") {
                  return (
                    <tr key={`stage-${idx}`} className="bg-[#0f1220]">
                      <td colSpan={8} className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-sky-300">
                        ▸ Giai đoạn: {entry.stage}
                      </td>
                    </tr>
                  );
                }
                return (
                  <ComponentBlock
                    key={`comp-${idx}`}
                    comp={entry.comp}
                    rows={entry.rows}
                    projectId={projectId}
                    expanded={expanded}
                    toggle={toggle}
                  />
                );
              })}
            </tbody>
            <tfoot className="bg-[#0f1220] text-[12px]">
              <tr>
                <td colSpan={4} className="px-2 py-2 text-right font-semibold text-zinc-300">Tổng cộng</td>
                <td className="px-2 py-2 text-right font-mono font-semibold text-emerald-200">{fmtVND(totals.materialAmount)}</td>
                <td className="px-2 py-2 text-right font-mono font-semibold text-amber-200">{fmtVND(totals.laborAmount)}</td>
                <td className="px-2 py-2 text-right font-mono font-semibold text-violet-200">{fmtVND(totals.machineAmount)}</td>
                <td className="px-2 py-2 text-right font-mono font-bold text-zinc-100">{fmtVND(totals.grandTotal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div className="text-center text-[10px] text-zinc-600">
        Bấm vào hàng để xem chi tiết công thức tính từng vật tư, công, ca máy.
      </div>
    </div>
  );
}

function ComponentBlock({
  comp,
  rows,
  projectId,
  expanded,
  toggle,
}: {
  comp: string;
  rows: TaskRow[];
  projectId: string;
  expanded: Set<string>;
  toggle: (id: string) => void;
}) {
  return (
    <>
      <tr className="bg-[#161929]">
        <td colSpan={8} className="px-3 py-1 text-[11px] font-medium text-zinc-400">
          ▪ {comp}
        </td>
      </tr>
      {rows.map((r) => {
        const isOpen = expanded.has(r.id);
        const canExpand = r.hasNorm && r.hasNormData;
        return (
          <RowAndExpand
            key={r.id}
            r={r}
            isOpen={isOpen}
            canExpand={canExpand}
            onToggle={() => canExpand && toggle(r.id)}
            projectId={projectId}
          />
        );
      })}
    </>
  );
}

function RowAndExpand({
  r,
  isOpen,
  canExpand,
  onToggle,
  projectId,
}: {
  r: TaskRow;
  isOpen: boolean;
  canExpand: boolean;
  onToggle: () => void;
  projectId: string;
}) {
  return (
    <>
      <tr
        className={`border-t border-[#252840] ${canExpand ? "cursor-pointer hover:bg-[#1d2238]" : ""} ${isOpen ? "bg-[#1d2238]" : ""}`}
        onClick={onToggle}
      >
        <td className="px-2 py-2 text-center text-zinc-500">
          {canExpand ? (isOpen ? "▾" : "▸") : ""}
        </td>
        <td className="px-2 py-2 text-zinc-100">
          <div className="font-medium">{r.name}</div>
          {r.normCode ? (
            <div className="text-[10px] text-zinc-500">
              ĐM {r.normCode}{r.normUnit ? ` · ${r.normUnit}` : ""}
            </div>
          ) : (
            <div className="text-[10px] text-amber-400">⚠ Chưa gắn ĐM</div>
          )}
        </td>
        <td className="px-2 py-2 text-right font-mono text-zinc-200">{fmtNum(r.quantity)}</td>
        <td className="px-2 py-2 text-zinc-400">{r.normUnit ?? "—"}</td>
        <td className="px-2 py-2 text-right">
          {r.materialAmount > 0 ? <span className="font-mono text-emerald-200">{fmtVND(r.materialAmount)}</span> : <span className="text-zinc-600">—</span>}
          {r.materialHasMissing && <span className="ml-1 text-[10px] text-amber-400">⚠</span>}
        </td>
        <td className="px-2 py-2 text-right">
          {r.laborAmount > 0 ? <span className="font-mono text-amber-200">{fmtVND(r.laborAmount)}</span> : <span className="text-zinc-600">—</span>}
          {r.laborHasMissing && <span className="ml-1 text-[10px] text-amber-400">⚠</span>}
        </td>
        <td className="px-2 py-2 text-right">
          {r.machineAmount > 0 ? <span className="font-mono text-violet-200">{fmtVND(r.machineAmount)}</span> : <span className="text-zinc-600">—</span>}
          {r.machineHasMissing && <span className="ml-1 text-[10px] text-amber-400">⚠</span>}
        </td>
        <td className="px-2 py-2 text-right font-mono font-semibold text-zinc-100">
          {r.totalAmount > 0 ? fmtVND(r.totalAmount) : "—"}
        </td>
      </tr>
      {isOpen && (
        <tr className="border-t border-[#252840] bg-[#10131f]">
          <td></td>
          <td colSpan={7} className="px-3 py-3">
            <ExpandDetail r={r} projectId={projectId} />
          </td>
        </tr>
      )}
    </>
  );
}

function ExpandDetail({ r, projectId }: { r: TaskRow; projectId: string }) {
  return (
    <div className="space-y-3 text-[11px]">
      <div className="text-[10px] text-zinc-500">
        Công thức: <span className="font-mono text-zinc-400">KL × ĐM/đvị × K = Hao phí</span> → <span className="font-mono text-zinc-400">× Đơn giá = Thành tiền</span>
      </div>

      {/* Vật tư */}
      {r.materialLines.length > 0 && (
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-2">
          <div className="mb-1 flex items-center justify-between text-[11px] font-semibold text-emerald-200">
            <span>📦 Vật tư</span>
            <span className="font-mono">{r.materialAmount > 0 ? fmtVND(r.materialAmount) + " đ" : "—"}</span>
          </div>
          <ul className="space-y-1">
            {r.materialLines.map((m, i) => (
              <li key={i} className="font-mono text-[11px] text-zinc-300">
                <span className="text-zinc-100">{m.name}</span>
                <span className="text-zinc-500"> ({m.unit}):</span>{" "}
                {fmtNum(r.quantity)} × {fmtNum(m.qtyPerUnit)}
                {m.k !== 1 && <> × {fmtNum(m.k)}</>}
                {" = "}
                <span className="text-emerald-200">{fmtNum(m.total)} {m.unit}</span>
                {m.price != null && m.amount != null ? (
                  <>
                    {" × "}
                    {fmtVND(m.price)} đ
                    {" = "}
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
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Nhân công */}
      {r.laborLines.length > 0 && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-2">
          <div className="mb-1 flex items-center justify-between text-[11px] font-semibold text-amber-200">
            <span>👥 Nhân công</span>
            <span className="font-mono">{r.laborAmount > 0 ? fmtVND(r.laborAmount) + " đ" : "—"}</span>
          </div>
          <ul className="space-y-1">
            {r.laborLines.map((l, i) => (
              <li key={i} className="font-mono text-[11px] text-zinc-300">
                <span className="text-zinc-100">Bậc {l.grade}:</span>{" "}
                {fmtNum(r.quantity)} × {fmtNum(l.qtyPerUnit)}
                {l.k !== 1 && <> × {fmtNum(l.k)}</>}
                {" = "}
                <span className="text-amber-200">{fmtNum(l.total)} công</span>
                {l.price != null && l.amount != null ? (
                  <>
                    {" × "}
                    {fmtVND(l.price)} đ
                    {" = "}
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
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Máy móc */}
      {r.machineLines.length > 0 && (
        <div className="rounded-lg border border-violet-500/20 bg-violet-500/5 p-2">
          <div className="mb-1 flex items-center justify-between text-[11px] font-semibold text-violet-200">
            <span>🏗 Máy móc</span>
            <span className="font-mono">{r.machineAmount > 0 ? fmtVND(r.machineAmount) + " đ" : "—"}</span>
          </div>
          <ul className="space-y-1">
            {r.machineLines.map((m, i) => (
              <li key={i} className="font-mono text-[11px] text-zinc-300">
                <span className="text-zinc-100">{m.name}:</span>{" "}
                {fmtNum(r.quantity)} × {fmtNum(m.qtyPerUnit)}
                {m.k !== 1 && <> × {fmtNum(m.k)}</>}
                {" = "}
                <span className="text-violet-200">{fmtNum(m.total)} ca</span>
                {m.price != null && m.amount != null ? (
                  <>
                    {" × "}
                    {fmtVND(m.price)} đ
                    {" = "}
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
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Sub total */}
      <div className="flex items-center justify-between rounded-lg border border-zinc-700 bg-zinc-800/40 px-3 py-2">
        <span className="text-[11px] font-semibold text-zinc-300">Tổng công tác này</span>
        <span className="font-mono text-[13px] font-bold text-zinc-100">
          {r.totalAmount > 0 ? fmtVND(r.totalAmount) + " đ" : "—"}
        </span>
      </div>
    </div>
  );
}
