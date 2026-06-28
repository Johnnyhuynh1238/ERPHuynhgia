"use client";

import Link from "next/link";
import { useMemo, useState, useEffect } from "react";
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

type ViewMode = "gd" | "ck" | "ct";

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

type StageAgg = {
  stage: string;
  materialAmount: number;
  laborAmount: number;
  machineAmount: number;
  totalAmount: number;
  taskCount: number;
  componentCount: number;
  hasMissing: boolean;
};
type CompAgg = {
  stage: string;
  componentName: string;
  componentSort: number;
  materialAmount: number;
  laborAmount: number;
  machineAmount: number;
  totalAmount: number;
  taskCount: number;
  hasMissing: boolean;
};

export function ByTaskClient({ projectId, projectName, projectCode, rows, totals }: Props) {
  const [view, setView] = useState<ViewMode>("gd");
  const [popupTask, setPopupTask] = useState<TaskRow | null>(null);

  const byStage = useMemo<StageAgg[]>(() => {
    const m = new Map<string, StageAgg & { _compSet: Set<string> }>();
    for (const r of rows) {
      const stage = r.stage ?? "—";
      let agg = m.get(stage);
      if (!agg) {
        agg = {
          stage,
          materialAmount: 0,
          laborAmount: 0,
          machineAmount: 0,
          totalAmount: 0,
          taskCount: 0,
          componentCount: 0,
          hasMissing: false,
          _compSet: new Set<string>(),
        };
        m.set(stage, agg);
      }
      agg.materialAmount += r.materialAmount;
      agg.laborAmount += r.laborAmount;
      agg.machineAmount += r.machineAmount;
      agg.totalAmount += r.totalAmount;
      agg.taskCount += 1;
      agg._compSet.add(r.componentName);
      if (r.materialHasMissing || r.laborHasMissing || r.machineHasMissing) agg.hasMissing = true;
    }
    return Array.from(m.values())
      .map((a) => ({ ...a, componentCount: a._compSet.size }))
      .sort((a, b) => a.stage.localeCompare(b.stage));
  }, [rows]);

  const byComp = useMemo<CompAgg[]>(() => {
    const m = new Map<string, CompAgg>();
    for (const r of rows) {
      const stage = r.stage ?? "—";
      const key = `${stage}__${r.componentName}`;
      let agg = m.get(key);
      if (!agg) {
        agg = {
          stage,
          componentName: r.componentName,
          componentSort: r.componentSort,
          materialAmount: 0,
          laborAmount: 0,
          machineAmount: 0,
          totalAmount: 0,
          taskCount: 0,
          hasMissing: false,
        };
        m.set(key, agg);
      }
      agg.materialAmount += r.materialAmount;
      agg.laborAmount += r.laborAmount;
      agg.machineAmount += r.machineAmount;
      agg.totalAmount += r.totalAmount;
      agg.taskCount += 1;
      if (r.materialHasMissing || r.laborHasMissing || r.machineHasMissing) agg.hasMissing = true;
    }
    return Array.from(m.values()).sort((a, b) => {
      if (a.stage !== b.stage) return a.stage.localeCompare(b.stage);
      return a.componentSort - b.componentSort;
    });
  }, [rows]);

  const taskCount = rows.length;
  const withMissing = rows.filter((r) => r.materialHasMissing || r.laborHasMissing || r.machineHasMissing).length;
  const grandTotal = totals.grandTotal;

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

      {/* Summary */}
      <div className="rounded-2xl border border-[#252840] bg-gradient-to-br from-[#1a1d2e] to-[#0f1220] p-4 ring-1 ring-orange-500/10">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Tổng giá vốn dự kiến</div>
            <div className="mt-1 text-2xl font-bold text-zinc-100 sm:text-3xl">
              {grandTotal > 0 ? fmtVND(grandTotal) + " đ" : "—"}
            </div>
          </div>
          <div className="text-right text-[11px] text-zinc-500">
            <div>{byStage.length} GĐ · {byComp.length} CK · {taskCount} CT</div>
            {withMissing > 0 && (
              <div className="text-amber-300">⚠ {withMissing} công tác thiếu giá</div>
            )}
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[11px]">
          <Cell tone="vt" label="📦 VT" amount={totals.materialAmount} grand={grandTotal} />
          <Cell tone="nc" label="👥 NC" amount={totals.laborAmount} grand={grandTotal} />
          <Cell tone="mm" label="🏗 MM" amount={totals.machineAmount} grand={grandTotal} />
        </div>
      </div>

      {/* Tab pills */}
      <div className="flex gap-1.5 rounded-xl border border-[#252840] bg-[#1a1d2e] p-1">
        <TabBtn active={view === "gd"} onClick={() => setView("gd")}>🏗 Giai đoạn</TabBtn>
        <TabBtn active={view === "ck"} onClick={() => setView("ck")}>🧱 Cấu kiện</TabBtn>
        <TabBtn active={view === "ct"} onClick={() => setView("ct")}>📑 Công tác</TabBtn>
      </div>

      {/* Body theo view */}
      {view === "gd" && (
        <div className="space-y-2">
          {byStage.map((s) => (
            <AggCard
              key={s.stage}
              title={s.stage}
              meta={`${s.componentCount} cấu kiện · ${s.taskCount} công tác`}
              grand={grandTotal}
              materialAmount={s.materialAmount}
              laborAmount={s.laborAmount}
              machineAmount={s.machineAmount}
              totalAmount={s.totalAmount}
              hasMissing={s.hasMissing}
            />
          ))}
          {byStage.length === 0 && <EmptyState />}
        </div>
      )}

      {view === "ck" && (
        <div className="space-y-2">
          {byComp.map((c) => (
            <AggCard
              key={`${c.stage}__${c.componentName}`}
              title={c.componentName}
              badges={[{ tone: "stage", label: c.stage }]}
              meta={`${c.taskCount} công tác`}
              grand={grandTotal}
              materialAmount={c.materialAmount}
              laborAmount={c.laborAmount}
              machineAmount={c.machineAmount}
              totalAmount={c.totalAmount}
              hasMissing={c.hasMissing}
            />
          ))}
          {byComp.length === 0 && <EmptyState />}
        </div>
      )}

      {view === "ct" && (
        <div className="space-y-2">
          {rows.map((r) => (
            <TaskCard key={r.id} r={r} onOpen={() => setPopupTask(r)} />
          ))}
          {rows.length === 0 && <EmptyState />}
        </div>
      )}

      <div className="text-center text-[10px] text-zinc-600">
        {view === "ct" ? "Bấm card để xem khối lượng + công thức chi tiết." : ""}
      </div>

      {popupTask && (
        <TaskFormulaModal r={popupTask} projectId={projectId} onClose={() => setPopupTask(null)} />
      )}
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-lg px-2 py-1.5 text-[11px] font-medium transition ${
        active
          ? "bg-sky-500/20 text-sky-200 ring-1 ring-sky-500/40"
          : "text-zinc-400 hover:bg-[#252840] hover:text-zinc-200"
      }`}
    >
      {children}
    </button>
  );
}

function Cell({ tone, label, amount, grand }: { tone: "vt" | "nc" | "mm"; label: string; amount: number; grand: number }) {
  const pct = grand > 0 ? Math.round((amount / grand) * 100) : 0;
  const cls = tone === "vt"
    ? "bg-emerald-500/10 ring-emerald-500/30 text-emerald-200"
    : tone === "nc"
      ? "bg-amber-500/10 ring-amber-500/30 text-amber-200"
      : "bg-violet-500/10 ring-violet-500/30 text-violet-200";
  return (
    <div className={`rounded-lg px-2 py-1.5 ring-1 ${cls}`}>
      <div className="font-medium">{label}</div>
      <div className="opacity-80">{amount > 0 ? fmtShort(amount) : "—"}</div>
      {amount > 0 && grand > 0 && <div className="text-[10px] opacity-60">{pct}%</div>}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-6 text-center text-[11px] text-zinc-500">
      Chưa có dữ liệu để hiển thị.
    </div>
  );
}

type Badge = { tone: "stage" | "comp"; label: string };

function AggCard({
  title,
  badges,
  meta,
  grand,
  materialAmount,
  laborAmount,
  machineAmount,
  totalAmount,
  hasMissing,
}: {
  title: string;
  badges?: Badge[];
  meta?: string;
  grand: number;
  materialAmount: number;
  laborAmount: number;
  machineAmount: number;
  totalAmount: number;
  hasMissing: boolean;
}) {
  const pct = grand > 0 ? Math.round((totalAmount / grand) * 100) : 0;
  return (
    <div className="overflow-hidden rounded-2xl border border-[#252840] bg-[#1a1d2e] p-3 ring-1 ring-zinc-800">
      <BadgeRow badges={badges} />
      <div className="flex items-baseline justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold leading-tight text-zinc-100">{title}</div>
          {meta && <div className="mt-0.5 text-[10px] text-zinc-500">{meta}</div>}
        </div>
        <div className="shrink-0 text-right">
          <div className="font-mono text-[14px] font-bold text-zinc-100">
            {totalAmount > 0 ? fmtVND(totalAmount) : "—"}
          </div>
          {grand > 0 && totalAmount > 0 && (
            <div className="text-[10px] text-zinc-500">{pct}% dự án</div>
          )}
          {hasMissing && <div className="text-[10px] text-amber-300">⚠ thiếu giá</div>}
        </div>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1.5 text-center text-[11px]">
        <Cell tone="vt" label="📦 VT" amount={materialAmount} grand={totalAmount} />
        <Cell tone="nc" label="👥 NC" amount={laborAmount} grand={totalAmount} />
        <Cell tone="mm" label="🏗 MM" amount={machineAmount} grand={totalAmount} />
      </div>
    </div>
  );
}

function BadgeRow({ badges }: { badges?: Badge[] }) {
  if (!badges || badges.length === 0) return null;
  return (
    <div className="mb-1.5 flex flex-wrap gap-1">
      {badges.map((b, i) => (
        <span
          key={i}
          className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium ${
            b.tone === "stage"
              ? "bg-sky-500/15 text-sky-200 ring-1 ring-sky-500/30"
              : "bg-zinc-700/40 text-zinc-300 ring-1 ring-zinc-700"
          }`}
        >
          {b.tone === "stage" ? "🏗 " : "🧱 "}{b.label}
        </span>
      ))}
    </div>
  );
}

function TaskCard({ r, onOpen }: { r: TaskRow; onOpen: () => void }) {
  const canExpand = r.hasNorm && r.hasNormData;
  const hasMissing = r.materialHasMissing || r.laborHasMissing || r.machineHasMissing;
  const badges: Badge[] = [
    { tone: "stage", label: r.stage ?? "—" },
    { tone: "comp", label: r.componentName },
  ];
  return (
    <button
      type="button"
      onClick={canExpand ? onOpen : undefined}
      disabled={!canExpand}
      className={`block w-full overflow-hidden rounded-2xl border border-[#252840] bg-[#1a1d2e] p-3 text-left ring-1 ring-zinc-800 ${
        canExpand ? "active:bg-[#1d2238]" : "cursor-default opacity-90"
      }`}
    >
      <BadgeRow badges={badges} />
      <div className="flex items-baseline justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold leading-tight text-zinc-100">{r.name}</div>
          {r.normCode ? (
            <div className="mt-0.5 text-[10px] text-zinc-500">
              ĐM {r.normCode}{r.normUnit ? ` · ${r.normUnit}` : ""}
            </div>
          ) : (
            <div className="mt-0.5 text-[10px] text-amber-400">⚠ Chưa gắn ĐM</div>
          )}
          <div className="mt-0.5 text-[10px] text-zinc-500">
            KL: <span className="font-mono text-zinc-300">{fmtNum(r.quantity)}</span> {r.normUnit ?? ""}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-mono text-[14px] font-bold text-zinc-100">
            {r.totalAmount > 0 ? fmtVND(r.totalAmount) : "—"}
          </div>
          {hasMissing && <div className="text-[10px] text-amber-300">⚠ thiếu giá</div>}
        </div>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1.5 text-center text-[11px]">
        <Cell tone="vt" label="📦 VT" amount={r.materialAmount} grand={r.totalAmount} />
        <Cell tone="nc" label="👥 NC" amount={r.laborAmount} grand={r.totalAmount} />
        <Cell tone="mm" label="🏗 MM" amount={r.machineAmount} grand={r.totalAmount} />
      </div>
    </button>
  );
}

function TaskFormulaModal({ r, projectId, onClose }: { r: TaskRow; projectId: string; onClose: () => void }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl border border-[#252840] bg-[#10131f] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal header */}
        <div className="sticky top-0 z-10 flex items-start justify-between gap-2 border-b border-[#252840] bg-[#10131f] px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap gap-1">
              <span className="rounded-full bg-sky-500/15 px-1.5 py-0.5 text-[9px] font-medium text-sky-200 ring-1 ring-sky-500/30">🏗 {r.stage ?? "—"}</span>
              <span className="rounded-full bg-zinc-700/40 px-1.5 py-0.5 text-[9px] font-medium text-zinc-300 ring-1 ring-zinc-700">🧱 {r.componentName}</span>
            </div>
            <h2 className="mt-1 text-[14px] font-semibold leading-tight text-zinc-100">{r.name}</h2>
            <div className="mt-0.5 text-[11px] text-zinc-500">
              {r.normCode ? `ĐM ${r.normCode}${r.normUnit ? ` · ${r.normUnit}` : ""}` : ""}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg border border-[#252840] bg-[#1a1d2e] px-2 py-1 text-[11px] text-zinc-300 hover:bg-zinc-700"
            aria-label="Đóng"
          >
            ✕
          </button>
        </div>

        {/* KL summary */}
        <div className="border-b border-[#252840] bg-[#0f1220] px-4 py-2 text-[11px]">
          <div className="flex items-baseline justify-between">
            <span className="text-zinc-400">Khối lượng:</span>
            <span className="font-mono text-zinc-100">
              {fmtNum(r.quantity)} {r.normUnit ?? ""}
            </span>
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-zinc-400">Tổng công tác:</span>
            <span className="font-mono text-[13px] font-bold text-zinc-100">
              {r.totalAmount > 0 ? fmtVND(r.totalAmount) + " đ" : "—"}
            </span>
          </div>
        </div>

        <div className="space-y-3 px-4 py-3 text-[11px]">
          <div className="text-[10px] text-zinc-500">
            Công thức: <span className="font-mono text-zinc-400">KL × ĐM × K = Hao phí</span> → <span className="font-mono text-zinc-400">× Đơn giá = Thành tiền</span>
          </div>

          {r.materialLines.length > 0 && (
            <FormulaGroup
              tone="vt"
              icon="📦"
              title="Vật tư"
              total={r.materialAmount}
              hasMissing={r.materialHasMissing}
              priceHref={`/projects/${projectId}/budget/prices?tab=vt`}
              lines={r.materialLines.map((m) => ({
                name: m.name,
                sub: `(${m.unit})`,
                qtyPerUnit: m.qtyPerUnit,
                k: m.k,
                total: m.total,
                totalUnit: m.unit,
                price: m.price,
                amount: m.amount,
              }))}
              quantity={r.quantity}
            />
          )}

          {r.laborLines.length > 0 && (
            <FormulaGroup
              tone="nc"
              icon="👥"
              title="Nhân công"
              total={r.laborAmount}
              hasMissing={r.laborHasMissing}
              priceHref={`/projects/${projectId}/budget/prices?tab=nc`}
              lines={r.laborLines.map((l) => ({
                name: `Bậc ${l.grade}`,
                sub: "",
                qtyPerUnit: l.qtyPerUnit,
                k: l.k,
                total: l.total,
                totalUnit: "công",
                price: l.price,
                amount: l.amount,
              }))}
              quantity={r.quantity}
            />
          )}

          {r.machineLines.length > 0 && (
            <FormulaGroup
              tone="mm"
              icon="🏗"
              title="Máy móc"
              total={r.machineAmount}
              hasMissing={r.machineHasMissing}
              priceHref={`/projects/${projectId}/budget/prices?tab=mm`}
              lines={r.machineLines.map((m) => ({
                name: m.name,
                sub: "",
                qtyPerUnit: m.qtyPerUnit,
                k: m.k,
                total: m.total,
                totalUnit: "ca",
                price: m.price,
                amount: m.amount,
              }))}
              quantity={r.quantity}
            />
          )}
        </div>
      </div>
    </div>
  );
}

type FormulaLine = {
  name: string;
  sub: string;
  qtyPerUnit: number;
  k: number;
  total: number;
  totalUnit: string;
  price: number | null;
  amount: number | null;
};

function FormulaGroup({
  tone,
  icon,
  title,
  total,
  hasMissing,
  priceHref,
  lines,
  quantity,
}: {
  tone: "vt" | "nc" | "mm";
  icon: string;
  title: string;
  total: number;
  hasMissing: boolean;
  priceHref: string;
  lines: FormulaLine[];
  quantity: number;
}) {
  const cls =
    tone === "vt"
      ? { border: "border-emerald-500/20 bg-emerald-500/5", text: "text-emerald-200", strong: "text-emerald-200" }
      : tone === "nc"
        ? { border: "border-amber-500/20 bg-amber-500/5", text: "text-amber-200", strong: "text-amber-200" }
        : { border: "border-violet-500/20 bg-violet-500/5", text: "text-violet-200", strong: "text-violet-200" };
  return (
    <div className={`rounded-lg border p-2 ${cls.border}`}>
      <div className={`mb-1.5 flex items-center justify-between text-[11px] font-semibold ${cls.text}`}>
        <span>{icon} {title}{hasMissing && <span className="ml-1 text-amber-300">⚠</span>}</span>
        <span className="font-mono">{total > 0 ? fmtVND(total) + " đ" : "—"}</span>
      </div>
      <ul className="space-y-1.5">
        {lines.map((l, i) => (
          <li key={i} className="text-[11px] leading-relaxed text-zinc-300">
            <div className="text-[11px] font-medium text-zinc-100">
              {l.name}{l.sub && <span className="text-zinc-500"> {l.sub}</span>}
            </div>
            <div className="font-mono text-[10.5px]">
              {fmtNum(quantity)} × {fmtNum(l.qtyPerUnit)}
              {l.k !== 1 && <> × {fmtNum(l.k)}</>}
              {" = "}
              <span className={cls.strong}>{fmtNum(l.total)} {l.totalUnit}</span>
              {l.price != null && l.amount != null ? (
                <>
                  <br />
                  <span className="text-zinc-500">× {fmtVND(l.price)} đ = </span>
                  <span className={`font-semibold ${cls.strong}`}>{fmtVND(l.amount)} đ</span>
                </>
              ) : (
                <>
                  {" × "}
                  <Link href={priceHref} className="text-amber-300 underline">
                    thiếu đơn giá
                  </Link>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
