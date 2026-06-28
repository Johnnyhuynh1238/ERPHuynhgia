"use client";

import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import type { ContribRow } from "../_lib/aggregate";

type MaterialRow = { name: string; unit: string; total: number; contributions: ContribRow[] };
type LaborRow = { grade: string; total: number; contributions: ContribRow[] };
type MachineRow = { name: string; total: number; contributions: ContribRow[] };

type Props = {
  projectId: string;
  projectName: string;
  projectCode: string;
  initialTab: "vt" | "nc" | "mm";
  data: {
    materials: MaterialRow[];
    labor: LaborRow[];
    machines: MachineRow[];
    itemsWithoutNorm: Array<{ id: string; stage: string | null; name: string; componentName: string }>;
    itemsWithNormNoData: Array<{ id: string; stage: string | null; name: string; componentName: string; normCode: string }>;
    totalItems: number;
    itemsWithNorm: number;
  };
};

const fmt = (n: number, digits = 3) =>
  n.toLocaleString("vi-VN", { maximumFractionDigits: digits, minimumFractionDigits: 0 });

export function TotalsClient({ projectId, projectName, projectCode, initialTab, data }: Props) {
  const [tab, setTab] = useState<"vt" | "nc" | "mm">(initialTab);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (key: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });

  const tabs: Array<{ key: "vt" | "nc" | "mm"; emoji: string; label: string; count: number }> = useMemo(
    () => [
      { key: "vt", emoji: "📦", label: "Vật tư", count: data.materials.length },
      { key: "nc", emoji: "👥", label: "Nhân công", count: data.labor.length },
      { key: "mm", emoji: "🏗", label: "Máy thi công", count: data.machines.length },
    ],
    [data.materials.length, data.labor.length, data.machines.length],
  );

  return (
    <div className="mx-auto max-w-3xl space-y-3 p-3 sm:p-4">
      <div>
        <Link
          href={`/projects/${projectId}/budget`}
          className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200"
        >
          ← Dự toán
        </Link>
        <div className="mt-1 text-xs font-medium uppercase tracking-wide text-zinc-500">
          Tổng hợp hao phí
        </div>
        <h1 className="text-base font-semibold text-zinc-100 sm:text-lg">{projectName}</h1>
        <div className="text-xs text-zinc-500">{projectCode}</div>
      </div>

      {data.totalItems > 0 && (
        <div className="rounded-xl border border-[#252840] bg-[#1a1d2e] p-3 text-xs text-zinc-400">
          <div className="flex items-center justify-between">
            <span>
              Đã tính từ <span className="text-zinc-200">{data.itemsWithNorm}/{data.totalItems}</span> công tác có gắn ĐM
            </span>
            {(data.itemsWithoutNorm.length > 0 || data.itemsWithNormNoData.length > 0) && (
              <span className="text-amber-400">⚠ {data.itemsWithoutNorm.length + data.itemsWithNormNoData.length} công tác bị bỏ qua</span>
            )}
          </div>
          {(data.itemsWithoutNorm.length > 0 || data.itemsWithNormNoData.length > 0) && (
            <details className="mt-2">
              <summary className="cursor-pointer text-amber-400/80">Xem danh sách công tác bỏ qua</summary>
              <ul className="mt-2 space-y-1 pl-4">
                {data.itemsWithoutNorm.map((it) => (
                  <li key={it.id} className="text-zinc-300">
                    <span className="text-zinc-500">[{it.stage}]</span> {it.componentName} / {it.name}
                    <span className="ml-2 text-amber-400/80">— chưa gắn ĐM</span>
                  </li>
                ))}
                {data.itemsWithNormNoData.map((it) => (
                  <li key={it.id} className="text-zinc-300">
                    <span className="text-zinc-500">[{it.stage}]</span> {it.componentName} / {it.name}
                    <span className="ml-2 text-amber-400/80">— ĐM {it.normCode} chưa có chi tiết hao phí</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex flex-col items-center rounded-xl border p-2 text-xs transition ${
              tab === t.key
                ? "border-sky-500/50 bg-sky-500/10 text-sky-200"
                : "border-[#252840] bg-[#1a1d2e] text-zinc-300 hover:border-[#3a3f5c]"
            }`}
          >
            <span className="text-xl leading-none">{t.emoji}</span>
            <span className="mt-1 font-medium">{t.label}</span>
            <span className="text-[10px] text-zinc-500">{t.count} loại</span>
          </button>
        ))}
      </div>

      {tab === "vt" && (
        <Section
          empty="Chưa có hao phí vật tư. Cần gắn ĐM cho công tác và đảm bảo ĐM có chi tiết materialItems."
          rows={data.materials.map((r) => ({
            key: `vt:${r.name}__${r.unit}`,
            primary: r.name,
            secondary: r.unit,
            total: r.total,
            contributions: r.contributions,
          }))}
          totalLabel="Tổng hao phí"
          unitColumn
          expanded={expanded}
          onToggle={toggle}
        />
      )}

      {tab === "nc" && (
        <Section
          empty="Chưa có hao phí nhân công."
          rows={data.labor.map((r) => ({
            key: `nc:${r.grade}`,
            primary: `Bậc ${r.grade}/7`,
            secondary: "công",
            total: r.total,
            contributions: r.contributions,
          }))}
          totalLabel="Tổng công"
          unitColumn
          expanded={expanded}
          onToggle={toggle}
        />
      )}

      {tab === "mm" && (
        <Section
          empty="Chưa có hao phí máy thi công."
          rows={data.machines.map((r) => ({
            key: `mm:${r.name}`,
            primary: r.name,
            secondary: "ca",
            total: r.total,
            contributions: r.contributions,
          }))}
          totalLabel="Tổng ca"
          unitColumn
          expanded={expanded}
          onToggle={toggle}
        />
      )}
    </div>
  );
}

type Row = {
  key: string;
  primary: string;
  secondary: string;
  total: number;
  contributions: ContribRow[];
};

function Section({
  rows,
  empty,
  totalLabel,
  unitColumn,
  expanded,
  onToggle,
}: {
  rows: Row[];
  empty: string;
  totalLabel: string;
  unitColumn: boolean;
  expanded: Set<string>;
  onToggle: (key: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-[#252840] bg-[#1a1d2e] p-6 text-center text-sm text-zinc-500">
        {empty}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-[#252840] bg-[#1a1d2e]">
      <table className="w-full text-sm">
        <thead className="border-b border-[#252840] bg-[#0f1220] text-[11px] uppercase tracking-wide text-zinc-500">
          <tr>
            <th className="px-3 py-2 text-left">Loại</th>
            {unitColumn && <th className="px-2 py-2 text-left">ĐV</th>}
            <th className="px-3 py-2 text-right">{totalLabel}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const isOpen = expanded.has(r.key);
            return (
              <Fragment key={r.key}>
                <tr
                  onClick={() => onToggle(r.key)}
                  className="cursor-pointer border-b border-[#252840] hover:bg-[#252840]/40"
                >
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      <span className="text-zinc-500">{isOpen ? "▾" : "▸"}</span>
                      <span className="text-zinc-100">{r.primary}</span>
                    </div>
                    <div className="text-[10px] text-zinc-500">{r.contributions.length} công tác đóng góp</div>
                  </td>
                  {unitColumn && (
                    <td className="px-2 py-2 text-xs text-zinc-400">{r.secondary}</td>
                  )}
                  <td className="px-3 py-2 text-right font-mono text-zinc-100">
                    {fmt(r.total)}
                  </td>
                </tr>
                {isOpen && (
                  <tr className="bg-[#0f1220]/60">
                    <td colSpan={unitColumn ? 3 : 2} className="px-3 py-2">
                      <div className="space-y-1 text-xs">
                        {r.contributions.map((c, i) => (
                          <div key={`${r.key}-c-${i}`} className="flex items-center justify-between gap-2 text-zinc-300">
                            <span className="truncate">
                              <span className="text-zinc-500">[{c.stage}]</span>{" "}
                              <span className="text-zinc-400">{c.componentName} /</span> {c.itemName}
                            </span>
                            <span className="shrink-0 font-mono text-zinc-400">
                              {fmt(c.quantity)} × {fmt(c.qtyPerUnit, 4)}
                              {c.k !== 1 ? ` × ${fmt(c.k, 2)}` : ""} ={" "}
                              <span className="text-zinc-200">{fmt(c.contrib)}</span>
                            </span>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
