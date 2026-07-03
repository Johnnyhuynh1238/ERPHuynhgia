"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type ProjectRow = {
  id: string;
  code: string;
  name: string;
  status: string;
  contractValue: number;
  collected: number;
  customerDebt: number;
  spent: number;
  budget: number | null;
  supplierDebt: number;
  subcontractorDebt: number;
  grossProfit: number;
};

type Overview = {
  summary: {
    totalContractValue: number;
    totalCollected: number;
    totalSpent: number;
    totalSpentProjects: number;
    generalTotal: number;
    grossProfit: number;
    cashBalance: number;
    customerDebt: number;
    supplierDebt: number;
    subcontractorDebt: number;
  };
  projects: ProjectRow[];
  generalExpenses: { categoryId: string | null; categoryName: string; amount: number }[];
};

const STATUS_LABEL: Record<string, string> = {
  planning: "Chuẩn bị",
  in_progress: "Đang thi công",
  completed: "Hoàn thành",
  paused: "Tạm dừng",
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

function KpiCard({ label, value, tone, href }: { label: string; value: number; tone?: "green" | "red" | "amber"; href?: string }) {
  const color =
    tone === "green" ? "text-emerald-400" : tone === "red" ? "text-red-400" : tone === "amber" ? "text-amber-400" : "text-[#f0f2ff]";
  const inner = (
    <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-3">
      <div className="text-xs text-[#8892b0]">{label}</div>
      <div className={`mt-1 text-lg font-bold ${color}`} title={`${fmt(value)} đ`}>
        {fmtShort(value)}
      </div>
    </div>
  );
  return href ? (
    <Link href={href} className="block transition-colors hover:opacity-90">
      {inner}
    </Link>
  ) : (
    inner
  );
}

export function FinanceOverviewClient() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showGeneral, setShowGeneral] = useState(false);

  useEffect(() => {
    fetch("/api/finance/overview", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => null))?.message ?? "Lỗi tải dữ liệu");
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="rounded-2xl border border-red-800 bg-red-950/40 p-4 text-sm text-red-300">{error}</div>;
  if (!data) return <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-6 text-center text-sm text-[#8892b0]">Đang tải…</div>;

  const s = data.summary;
  const active = data.projects.filter((p) => p.contractValue > 0 || p.collected > 0 || p.spent > 0);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <KpiCard label="Doanh thu đã thu" value={s.totalCollected} tone="green" />
        <KpiCard label="Tổng chi" value={s.totalSpent} tone="red" />
        <KpiCard label="Lãi gộp tạm tính" value={s.grossProfit} tone={s.grossProfit >= 0 ? "green" : "red"} />
        <KpiCard label="Số dư quỹ" value={s.cashBalance} href="/treasury" />
        <KpiCard label="Công nợ khách hàng" value={s.customerDebt} tone="amber" />
        <KpiCard label="Công nợ NCC" value={s.supplierDebt} tone="amber" href="/payables" />
        <KpiCard label="Công nợ thầu phụ" value={s.subcontractorDebt} tone="amber" href="/sub-payments" />
        <KpiCard label="Chi chung công ty" value={s.generalTotal} href="#general-expenses" />
      </div>

      <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-3">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-orange-300">Doanh thu & chi phí theo dự án</h2>
          <span className="text-xs text-[#8892b0]">{active.length} dự án</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-[#252840] text-left text-xs text-[#8892b0]">
                <th className="py-2 pr-2 font-medium">Dự án</th>
                <th className="py-2 pr-2 text-right font-medium">Giá trị HĐ</th>
                <th className="py-2 pr-2 text-right font-medium">Đã thu</th>
                <th className="py-2 pr-2 text-right font-medium">KH còn nợ</th>
                <th className="py-2 pr-2 text-right font-medium">Đã chi</th>
                <th className="py-2 pr-2 text-right font-medium">Dự toán</th>
                <th className="py-2 text-right font-medium">Lãi tạm</th>
              </tr>
            </thead>
            <tbody>
              {active.map((p) => (
                <tr key={p.id} className="border-b border-[#1f2337] hover:bg-[#22263a]">
                  <td className="py-2 pr-2">
                    <Link href={`/projects/${p.id}/finance`} className="block">
                      <div className="font-medium text-[#f0f2ff]">{p.code}</div>
                      <div className="max-w-[180px] truncate text-xs text-[#8892b0]">
                        {p.name} • {STATUS_LABEL[p.status] ?? p.status}
                      </div>
                    </Link>
                  </td>
                  <td className="py-2 pr-2 text-right tabular-nums text-[#f0f2ff]">{fmtShort(p.contractValue)}</td>
                  <td className="py-2 pr-2 text-right tabular-nums text-emerald-400">{fmtShort(p.collected)}</td>
                  <td className={`py-2 pr-2 text-right tabular-nums ${p.customerDebt > 0 ? "text-amber-400" : "text-[#8892b0]"}`}>
                    {fmtShort(p.customerDebt)}
                  </td>
                  <td className="py-2 pr-2 text-right tabular-nums text-red-400">{fmtShort(p.spent)}</td>
                  <td className="py-2 pr-2 text-right tabular-nums text-[#8892b0]">
                    {p.budget != null ? fmtShort(p.budget) : "—"}
                  </td>
                  <td className={`py-2 text-right tabular-nums font-semibold ${p.grossProfit >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {fmtShort(p.grossProfit)}
                  </td>
                </tr>
              ))}
              {active.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-sm text-[#8892b0]">
                    Chưa có dữ liệu tài chính dự án.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div id="general-expenses" className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-3">
        <button
          type="button"
          onClick={() => setShowGeneral((v) => !v)}
          className="flex w-full items-center justify-between"
        >
          <h2 className="text-sm font-semibold text-orange-300">Chi phí chung công ty (không gắn dự án)</h2>
          <span className="text-sm font-bold text-red-400">{fmtShort(s.generalTotal)}</span>
        </button>
        {showGeneral && (
          <div className="mt-2 space-y-1">
            {data.generalExpenses.map((g) => (
              <div key={g.categoryId ?? "none"} className="flex items-center justify-between rounded-lg bg-[#171a27] px-3 py-2 text-sm">
                <span className="text-[#f0f2ff]">{g.categoryName}</span>
                <span className="tabular-nums text-red-400">{fmt(g.amount)} đ</span>
              </div>
            ))}
            {data.generalExpenses.length === 0 && (
              <div className="py-3 text-center text-sm text-[#8892b0]">Chưa có chi phí chung.</div>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Link href="/receipts" className="rounded-xl border border-[#252840] bg-[#13151f] p-3 text-center text-sm text-[#f0f2ff] hover:bg-[#1a1d2e]">
          Lệnh thu
        </Link>
        <Link href="/expenses" className="rounded-xl border border-[#252840] bg-[#13151f] p-3 text-center text-sm text-[#f0f2ff] hover:bg-[#1a1d2e]">
          Lệnh chi
        </Link>
        <Link href="/treasury" className="rounded-xl border border-[#252840] bg-[#13151f] p-3 text-center text-sm text-[#f0f2ff] hover:bg-[#1a1d2e]">
          Sổ quỹ
        </Link>
        <Link href="/payables" className="rounded-xl border border-[#252840] bg-[#13151f] p-3 text-center text-sm text-[#f0f2ff] hover:bg-[#1a1d2e]">
          Công nợ NCC
        </Link>
      </div>
    </div>
  );
}
