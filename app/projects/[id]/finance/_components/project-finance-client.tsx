"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";

type ScheduleRow = {
  id: string;
  label: string;
  percent: number | null;
  amount: number;
  status: string;
  collected: number;
  date: string | null;
};

type FinanceData = {
  project: { id: string; code: string; name: string; status: string };
  revenue: {
    contractValue: number;
    collected: number;
    remaining: number;
    schedules: ScheduleRow[];
    extraReceipts: { id: string; code: string; amount: number; receivedAt: string | null; note: string | null }[];
  };
  cost: {
    spent: number;
    breakdown: { cashExpense: number; subPayment: number; material: number; payroll: number };
    byCategory: { name: string; amount: number }[];
  };
  debt: {
    supplierTotal: number;
    suppliers: { name: string; amount: number }[];
    subcontractorTotal: number;
    subContracts: { id: string; code: string; title: string; subcontractorName: string; contractValue: number; paid: number; debt: number }[];
  };
  budget: { status: string; totalLabor: number; totalMaterial: number; totalEquipment: number; totalAmount: number } | null;
  grossProfit: number;
};

const SCHEDULE_STATUS: Record<string, { label: string; cls: string }> = {
  collected: { label: "Đã thu", cls: "bg-emerald-500/15 text-emerald-400" },
  paid: { label: "Đã thu", cls: "bg-emerald-500/15 text-emerald-400" },
  request_sent: { label: "Đã gửi YC", cls: "bg-sky-500/15 text-sky-400" },
  customer_late: { label: "KH trễ hạn", cls: "bg-red-500/15 text-red-400" },
  overdue: { label: "Quá hạn", cls: "bg-red-500/15 text-red-400" },
  not_collected: { label: "Chưa thu", cls: "bg-slate-500/15 text-slate-400" },
  pending: { label: "Chưa thu", cls: "bg-slate-500/15 text-slate-400" },
  cancelled: { label: "Huỷ", cls: "bg-slate-500/15 text-slate-500" },
};

function fmt(n: number) {
  return n.toLocaleString("vi-VN", { maximumFractionDigits: 0 });
}

function fmtShort(n: number) {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}${(abs / 1_000_000_000).toFixed(abs % 1_000_000_000 === 0 ? 0 : 1)} tỷ`;
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(abs % 1_000_000 === 0 ? 0 : 1)} tr`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(0)}k`;
  return `${sign}${fmt(abs)}`;
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("vi-VN");
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full overflow-y-auto rounded-t-2xl border border-[#252840] bg-[#13151f] p-4 sm:max-w-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold text-orange-300">{title}</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-[#8892b0] hover:bg-[#22263a]">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
  onClick,
  hint,
}: {
  label: string;
  value: number;
  tone?: "green" | "red" | "amber";
  onClick?: () => void;
  hint?: string;
}) {
  const color =
    tone === "green" ? "text-emerald-400" : tone === "red" ? "text-red-400" : tone === "amber" ? "text-amber-400" : "text-[#f0f2ff]";
  const body = (
    <>
      <div className="text-xs text-[#8892b0]">{label}</div>
      <div className={`mt-1 text-lg font-bold ${color}`} title={`${fmt(value)} đ`}>
        {fmtShort(value)}
      </div>
      {hint ? <div className="mt-0.5 text-[10px] text-[#8892b0]">{hint}</div> : null}
    </>
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-3 text-left transition-colors hover:bg-[#22263a]">
        {body}
      </button>
    );
  }
  return <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-3">{body}</div>;
}

export function ProjectFinanceClient({ projectId }: { projectId: string }) {
  const [data, setData] = useState<FinanceData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<"schedules" | "supplier" | "sub" | null>(null);

  useEffect(() => {
    fetch(`/api/projects/${projectId}/finance`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => null))?.message ?? "Lỗi tải dữ liệu");
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message));
  }, [projectId]);

  if (error) return <div className="rounded-2xl border border-red-800 bg-red-950/40 p-4 text-sm text-red-300">{error}</div>;
  if (!data) return <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-6 text-center text-sm text-[#8892b0]">Đang tải…</div>;

  const { revenue, cost, debt, budget } = data;
  const breakdownRows = [
    { label: "Lệnh chi (sổ quỹ)", amount: cost.breakdown.cashExpense },
    { label: "Thầu phụ đã chi", amount: cost.breakdown.subPayment },
    { label: "Vật tư NCC đã trả", amount: cost.breakdown.material },
    { label: "Lương thợ đã trả", amount: cost.breakdown.payroll },
  ].filter((r) => r.amount > 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-orange-300">Tài chính dự án</h2>
        <Link href="/finance" className="shrink-0 rounded-lg border border-[#252840] px-3 py-1.5 text-xs text-[#8892b0] hover:bg-[#22263a]">
          Tài chính cty →
        </Link>
      </div>

      {/* Doanh thu */}
      <div className="grid grid-cols-3 gap-2">
        <StatCard label="Giá trị HĐ" value={revenue.contractValue} />
        <StatCard label="Đã thu" value={revenue.collected} tone="green" onClick={() => setModal("schedules")} hint="Bấm xem các đợt" />
        <StatCard
          label="Còn lại"
          value={revenue.remaining}
          tone={revenue.remaining > 0 ? "amber" : "green"}
          onClick={() => setModal("schedules")}
          hint="Bấm xem các đợt"
        />
      </div>

      {/* Chi phí + công nợ */}
      <div className="grid grid-cols-3 gap-2">
        <StatCard label="Đã chi" value={cost.spent} tone="red" />
        <StatCard label="Công nợ NCC" value={debt.supplierTotal} tone="amber" onClick={() => setModal("supplier")} hint="Bấm xem theo NCC" />
        <StatCard label="Công nợ thầu phụ" value={debt.subcontractorTotal} tone="amber" onClick={() => setModal("sub")} hint="Bấm xem theo HĐ" />
      </div>

      <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-[#8892b0]">Lãi gộp tạm tính (đã thu − đã chi)</span>
          <span className={`text-lg font-bold tabular-nums ${data.grossProfit >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {fmt(data.grossProfit)} đ
          </span>
        </div>
      </div>

      {/* Breakdown chi */}
      <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-3">
        <h2 className="mb-2 text-sm font-semibold text-orange-300">Chi phí theo nhóm</h2>
        <div className="space-y-1">
          {breakdownRows.map((r) => (
            <div key={r.label} className="flex items-center justify-between rounded-lg bg-[#171a27] px-3 py-2 text-sm">
              <span className="text-[#f0f2ff]">{r.label}</span>
              <span className="tabular-nums text-red-400">{fmt(r.amount)} đ</span>
            </div>
          ))}
          {breakdownRows.length === 0 && <div className="py-3 text-center text-sm text-[#8892b0]">Chưa có khoản chi.</div>}
        </div>
        {cost.byCategory.length > 0 && (
          <div className="mt-3">
            <div className="mb-1 text-xs font-medium text-[#8892b0]">Lệnh chi theo danh mục</div>
            <div className="space-y-1">
              {cost.byCategory.map((c) => (
                <div key={c.name} className="flex items-center justify-between px-3 py-1 text-xs">
                  <span className="text-[#8892b0]">{c.name}</span>
                  <span className="tabular-nums text-[#f0f2ff]">{fmt(c.amount)} đ</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Dự toán vs thực chi */}
      {budget && (
        <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-3">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-orange-300">Dự toán vs thực chi</h2>
            <Link href={`/projects/${projectId}/budget`} className="text-xs text-sky-400 hover:underline">
              Xem dự toán →
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#252840] text-left text-xs text-[#8892b0]">
                  <th className="py-1.5 pr-2 font-medium">Khoản</th>
                  <th className="py-1.5 pr-2 text-right font-medium">Dự toán</th>
                  <th className="py-1.5 text-right font-medium">Thực chi</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-[#1f2337]">
                  <td className="py-1.5 pr-2 text-[#f0f2ff]">Nhân công</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums text-[#8892b0]">{fmtShort(budget.totalLabor)}</td>
                  <td className="py-1.5 text-right tabular-nums text-[#f0f2ff]">{fmtShort(cost.breakdown.payroll + cost.breakdown.subPayment)}</td>
                </tr>
                <tr className="border-b border-[#1f2337]">
                  <td className="py-1.5 pr-2 text-[#f0f2ff]">Vật tư</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums text-[#8892b0]">{fmtShort(budget.totalMaterial)}</td>
                  <td className="py-1.5 text-right tabular-nums text-[#f0f2ff]">{fmtShort(cost.breakdown.material)}</td>
                </tr>
                <tr className="border-b border-[#1f2337]">
                  <td className="py-1.5 pr-2 text-[#f0f2ff]">Máy móc + khác</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums text-[#8892b0]">{fmtShort(budget.totalEquipment)}</td>
                  <td className="py-1.5 text-right tabular-nums text-[#f0f2ff]">{fmtShort(cost.breakdown.cashExpense)}</td>
                </tr>
                <tr>
                  <td className="py-1.5 pr-2 font-semibold text-[#f0f2ff]">Tổng</td>
                  <td className="py-1.5 pr-2 text-right font-semibold tabular-nums text-[#8892b0]">{fmtShort(budget.totalAmount)}</td>
                  <td className={`py-1.5 text-right font-semibold tabular-nums ${cost.spent > budget.totalAmount ? "text-red-400" : "text-emerald-400"}`}>
                    {fmtShort(cost.spent)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          {cost.spent > budget.totalAmount && (
            <div className="mt-2 rounded-lg bg-red-950/40 px-3 py-2 text-xs text-red-300">
              Thực chi vượt dự toán {fmt(cost.spent - budget.totalAmount)} đ.
            </div>
          )}
        </div>
      )}

      {/* Modal các đợt thu */}
      {modal === "schedules" && (
        <Modal title="Các đợt thanh toán" onClose={() => setModal(null)}>
          <div className="space-y-1.5">
            {revenue.schedules.map((r) => {
              const st = SCHEDULE_STATUS[r.status] ?? { label: r.status, cls: "bg-slate-500/15 text-slate-400" };
              return (
                <div key={r.id} className="rounded-lg bg-[#171a27] px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-[#f0f2ff]">{r.label}</span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${st.cls}`}>{st.label}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-xs text-[#8892b0]">
                    <span>
                      {r.percent != null ? `${r.percent}% • ` : ""}
                      {fmtDate(r.date)}
                    </span>
                    <span className="tabular-nums">
                      {r.collected > 0 ? `${fmt(r.collected)} / ` : ""}
                      {fmt(r.amount)} đ
                    </span>
                  </div>
                </div>
              );
            })}
            {revenue.extraReceipts.map((r) => (
              <div key={r.id} className="rounded-lg bg-[#171a27] px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-[#f0f2ff]">Thu ngoài đợt — {r.code}</span>
                  <span className="shrink-0 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">Đã thu</span>
                </div>
                <div className="mt-1 flex items-center justify-between text-xs text-[#8892b0]">
                  <span>{fmtDate(r.receivedAt)}{r.note ? ` • ${r.note}` : ""}</span>
                  <span className="tabular-nums">{fmt(r.amount)} đ</span>
                </div>
              </div>
            ))}
            {revenue.schedules.length === 0 && revenue.extraReceipts.length === 0 && (
              <div className="py-4 text-center text-sm text-[#8892b0]">Chưa có đợt thanh toán.</div>
            )}
          </div>
        </Modal>
      )}

      {/* Modal công nợ NCC */}
      {modal === "supplier" && (
        <Modal title="Công nợ NCC vật tư" onClose={() => setModal(null)}>
          <div className="space-y-1.5">
            {debt.suppliers.map((sup) => (
              <div key={sup.name} className="flex items-center justify-between rounded-lg bg-[#171a27] px-3 py-2 text-sm">
                <span className="text-[#f0f2ff]">{sup.name}</span>
                <span className="tabular-nums text-amber-400">{fmt(sup.amount)} đ</span>
              </div>
            ))}
            {debt.suppliers.length === 0 && <div className="py-4 text-center text-sm text-[#8892b0]">Không còn công nợ NCC.</div>}
          </div>
        </Modal>
      )}

      {/* Modal công nợ thầu phụ */}
      {modal === "sub" && (
        <Modal title="Công nợ thầu phụ" onClose={() => setModal(null)}>
          <div className="space-y-1.5">
            {debt.subContracts.map((c) => (
              <Link key={c.id} href={`/sub-contracts/${c.id}`} className="block rounded-lg bg-[#171a27] px-3 py-2 hover:bg-[#22263a]">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-[#f0f2ff]">
                    {c.code} — {c.subcontractorName}
                  </span>
                  <span className={`tabular-nums font-semibold ${c.debt > 0 ? "text-amber-400" : "text-emerald-400"}`}>{fmt(c.debt)} đ</span>
                </div>
                <div className="mt-0.5 text-xs text-[#8892b0]">
                  {c.title} • HĐ {fmtShort(c.contractValue)} • đã chi {fmtShort(c.paid)}
                </div>
              </Link>
            ))}
            {debt.subContracts.length === 0 && <div className="py-4 text-center text-sm text-[#8892b0]">Không có HĐ thầu phụ.</div>}
          </div>
        </Modal>
      )}
    </div>
  );
}
