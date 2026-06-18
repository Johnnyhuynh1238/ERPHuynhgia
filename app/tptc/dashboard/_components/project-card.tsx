"use client";

import Link from "next/link";
import { AlertTriangle, CalendarDays } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export type ProjectMetrics = {
  id: string;
  code: string;
  name: string;
  address: string;
  status: "planning" | "in_progress" | "completed" | "paused";
  startDate: string;
  expectedEndDate: string;
  mainEngineer: { id: string; name: string } | null;
  budget: {
    labor: { planned: number; used: number };
    material: { planned: number; used: number };
    equipment: { planned: number; used: number };
    total: { planned: number; used: number };
  };
  workOrders: {
    todayTotal: number;
    todayOpen: number;
    todayDone: number;
    carried: number;
    stuckDays: number;
  };
  eod: {
    submittedToday: boolean;
    missingDays: number;
  };
  qc: {
    pendingReview: number;
    failedThisWeek: number;
  };
  payroll: {
    weekKey: string;
    status: "draft" | "ready_to_pay" | "paid" | "missing";
    totalPayable: number;
    bonusPool: number;
    negStreak: number;
  };
  alerts: string[];
};

export function fmtMoney(n: number): string {
  if (n === 0) return "0";
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)} tỷ`;
  if (n >= 1_000_000) return `${Math.round(n / 1_000_000)} triệu`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return n.toString();
}

function statusLabel(s: ProjectMetrics["status"]): string {
  if (s === "in_progress") return "Đang thi công";
  if (s === "planning") return "Lập kế hoạch";
  if (s === "paused") return "Tạm dừng";
  return "Hoàn thành";
}

function payrollLabel(s: ProjectMetrics["payroll"]["status"]): string {
  if (s === "missing") return "Chưa lập";
  if (s === "draft") return "Đang nháp";
  if (s === "ready_to_pay") return "Chờ kế toán chi";
  return "Đã chi";
}

function pctOf(planned: number, used: number) {
  return planned > 0 ? Math.round((used / planned) * 100) : 0;
}

function ProgressRow({ href, label, planned, used }: { href: string; label: string; planned: number; used: number }) {
  const pct = pctOf(planned, used);
  const cap = Math.min(100, pct);
  const bar = pct >= 90 ? "bg-red-500/70" : pct >= 75 ? "bg-amber-500/70" : "bg-emerald-500/60";
  const text = pct >= 90 ? "text-red-300" : pct >= 75 ? "text-amber-300" : "text-emerald-300";
  return (
    <Link href={href} className="block rounded-md px-2 py-1.5 hover:bg-[#22263a]">
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-[#cdd6f4]">{label}</span>
        <span className={`font-medium ${text}`}>
          {pct}% <span className="text-[10px] text-[#8892b0]">· {fmtMoney(used)} / {fmtMoney(planned)}</span>
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#0f1220]">
        <div className={`h-full ${bar}`} style={{ width: `${cap}%` }} />
      </div>
    </Link>
  );
}

export function ProjectCard({ project }: { project: ProjectMetrics; expanded?: boolean }) {
  const p = project;
  const totalPct = pctOf(p.budget.total.planned, p.budget.total.used);

  return (
    <Card className="border-[#252840] bg-[#1a1d2e]">
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <Link href={`/projects/${p.id}`} className="text-base font-semibold text-orange-200 hover:underline">
              {p.code} — {p.name}
            </Link>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#8892b0]">
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="h-3 w-3" /> {p.startDate} → {p.expectedEndDate}
              </span>
              <span>•</span>
              <span>{statusLabel(p.status)}</span>
              {p.mainEngineer && (
                <>
                  <span>•</span>
                  <span>
                    Kỹ sư phụ trách:{" "}
                    <Link href={`/projects/${p.id}/members`} className="text-[#cdd6f4] hover:underline">{p.mainEngineer.name}</Link>
                  </span>
                </>
              )}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wide text-[#8892b0]">Đã dùng dự toán</div>
            <div className={`text-2xl font-bold leading-none ${totalPct >= 90 ? "text-red-300" : totalPct >= 75 ? "text-amber-300" : "text-emerald-300"}`}>
              {totalPct}%
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-[#2d3249] bg-[#171a27] p-2">
          <div className="mb-1 px-2 text-[10px] uppercase tracking-wide text-[#8892b0]">Tiến độ dự toán</div>
          <ProgressRow href={`/projects/${p.id}/budget?cat=labor`} label="Nhân công" planned={p.budget.labor.planned} used={p.budget.labor.used} />
          <ProgressRow href={`/projects/${p.id}/budget?cat=material`} label="Vật tư" planned={p.budget.material.planned} used={p.budget.material.used} />
          <ProgressRow href={`/projects/${p.id}/budget?cat=equipment`} label="Máy móc" planned={p.budget.equipment.planned} used={p.budget.equipment.used} />
        </div>

        <TodayLine project={p} />

        <Link href={`/projects/${p.id}/payroll?week=${p.payroll.weekKey}`} className="flex items-center justify-between rounded-lg border border-[#2d3249] bg-[#171a27] px-3 py-2 hover:bg-[#22263a]">
          <div>
            <div className="text-xs text-[#8892b0]">Lương tuần {p.payroll.weekKey} • {payrollLabel(p.payroll.status)}</div>
            <div className="mt-0.5 text-lg font-bold text-emerald-300">{fmtMoney(p.payroll.totalPayable)}</div>
          </div>
          <div className="text-right text-[10px] text-[#8892b0]">
            Quỹ thưởng: {fmtMoney(p.payroll.bonusPool)}
            {p.payroll.negStreak > 0 && <div className="text-amber-300">âm {p.payroll.negStreak} tuần liên tiếp</div>}
          </div>
        </Link>

        {p.alerts.length > 0 && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-2.5">
            <div className="mb-1 inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-red-300">
              <AlertTriangle className="h-3 w-3" /> Cảnh báo
            </div>
            <ul className="space-y-0.5 text-xs text-[#cdd6f4]">
              {p.alerts.map((a, idx) => (
                <li key={idx} className="flex items-center gap-2">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-400" />
                  {a}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TodayLine({ project: p }: { project: ProjectMetrics }) {
  const woTone = p.workOrders.todayOpen > 0 ? "text-amber-300" : "text-emerald-300";
  const eodTone = p.eod.submittedToday ? "text-emerald-300" : "text-red-300";
  const qcTone = p.qc.pendingReview > 0 ? "text-amber-300" : "text-[#cdd6f4]";

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      <Link href={`/projects/${p.id}/work-orders`} className="rounded-lg border border-[#2d3249] bg-[#171a27] px-3 py-2 hover:bg-[#22263a]">
        <div className="text-[10px] uppercase tracking-wide text-[#8892b0]">Phiếu giao việc hôm nay</div>
        <div className={`mt-0.5 text-lg font-bold ${woTone}`}>
          {p.workOrders.todayDone}/{p.workOrders.todayTotal} <span className="text-xs font-normal text-[#8892b0]">hoàn thành</span>
        </div>
        {p.workOrders.carried > 0 && (
          <div className="mt-0.5 text-[11px] text-amber-300">
            {p.workOrders.carried} phiếu chuyển sang ngày sau
            {p.workOrders.stuckDays >= 2 && ` · tắc ${p.workOrders.stuckDays} ngày`}
          </div>
        )}
      </Link>
      <Link href={`/projects/${p.id}/eod`} className="rounded-lg border border-[#2d3249] bg-[#171a27] px-3 py-2 hover:bg-[#22263a]">
        <div className="text-[10px] uppercase tracking-wide text-[#8892b0]">Báo cáo cuối ngày</div>
        <div className={`mt-0.5 text-lg font-bold ${eodTone}`}>
          {p.eod.submittedToday ? "Đã nộp" : "Chưa nộp"}
        </div>
        <div className={`mt-0.5 text-[11px] ${qcTone}`}>
          {p.qc.pendingReview > 0
            ? `${p.qc.pendingReview} sản lượng chờ nghiệm thu`
            : "Không có sản lượng chờ"}
          {p.qc.failedThisWeek > 0 && <span className="ml-1 text-red-300">· {p.qc.failedThisWeek} fail tuần này</span>}
        </div>
      </Link>
    </div>
  );
}
