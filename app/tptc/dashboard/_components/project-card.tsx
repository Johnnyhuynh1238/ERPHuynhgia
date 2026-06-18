"use client";

import Link from "next/link";
import { AlertTriangle, BadgeCheck, Briefcase, CalendarDays, ChevronRight, Clock, HardHat, ShieldAlert, Wrench } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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

function fmtMoney(n: number): string {
  if (n === 0) return "0";
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)} tỷ`;
  if (n >= 1_000_000) return `${Math.round(n / 1_000_000)}tr`;
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
  if (s === "missing") return "Chưa có";
  if (s === "draft") return "Nháp";
  if (s === "ready_to_pay") return "Chờ chi";
  return "Đã chi";
}

function ProgressBar({ planned, used, label }: { planned: number; used: number; label: string }) {
  const pct = planned > 0 ? Math.min(100, Math.round((used / planned) * 100)) : 0;
  const overPct = planned > 0 ? Math.round((used / planned) * 100) : 0;
  const bar = pct >= 90 ? "bg-red-500/70" : pct >= 75 ? "bg-amber-500/70" : "bg-emerald-500/60";
  const text = overPct >= 90 ? "text-red-300" : overPct >= 75 ? "text-amber-300" : "text-emerald-300";
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-[#8892b0]">{label}</span>
        <span className={`font-medium ${text}`}>{overPct}%</span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-[#0f1220]">
        <div className={`h-full ${bar}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1 text-[10px] text-[#8892b0]">
        {fmtMoney(used)} / {fmtMoney(planned)}
      </div>
    </div>
  );
}

export function ProjectCard({ project, expanded = false }: { project: ProjectMetrics; expanded?: boolean }) {
  const p = project;

  return (
    <Card className="border-[#252840] bg-[#1a1d2e]">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-orange-200">
              <Link href={`/projects/${p.id}`} className="hover:underline">
                {p.code} — {p.name}
              </Link>
            </CardTitle>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-[#8892b0]">
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="h-3 w-3" /> {p.startDate} → {p.expectedEndDate}
              </span>
              <span className="inline-flex items-center gap-1">
                <Briefcase className="h-3 w-3" /> {statusLabel(p.status)}
              </span>
              {p.mainEngineer && (
                <span className="inline-flex items-center gap-1">
                  <HardHat className="h-3 w-3" /> KS:{" "}
                  <Link href={`/projects/${p.id}/members`} className="hover:underline">{p.mainEngineer.name}</Link>
                </span>
              )}
            </div>
          </div>
          {p.alerts.length > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-xs text-red-300">
              <AlertTriangle className="h-3 w-3" /> {p.alerts.length} cảnh báo
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Link href={`/projects/${p.id}/budget?cat=labor`} className="rounded-lg border border-[#2d3249] bg-[#171a27] p-3 hover:bg-[#22263a]">
            <ProgressBar planned={p.budget.labor.planned} used={p.budget.labor.used} label="NC (Nhân công)" />
          </Link>
          <Link href={`/projects/${p.id}/budget?cat=material`} className="rounded-lg border border-[#2d3249] bg-[#171a27] p-3 hover:bg-[#22263a]">
            <ProgressBar planned={p.budget.material.planned} used={p.budget.material.used} label="VT (Vật tư)" />
          </Link>
          <Link href={`/projects/${p.id}/budget?cat=equipment`} className="rounded-lg border border-[#2d3249] bg-[#171a27] p-3 hover:bg-[#22263a]">
            <ProgressBar planned={p.budget.equipment.planned} used={p.budget.equipment.used} label="MM (Máy móc)" />
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MetricBox
            href={`/projects/${p.id}/work-orders`}
            icon={<Wrench className="h-3.5 w-3.5" />}
            label="WO hôm nay"
            value={`${p.workOrders.todayDone}/${p.workOrders.todayTotal}`}
            sub={p.workOrders.todayOpen > 0 ? `${p.workOrders.todayOpen} chưa xong` : "tất cả xong"}
            tone={p.workOrders.todayOpen > 0 ? "warn" : "good"}
          />
          <MetricBox
            href={`/projects/${p.id}/work-orders?status=carried`}
            icon={<Clock className="h-3.5 w-3.5" />}
            label="WO carried"
            value={p.workOrders.carried}
            sub={p.workOrders.stuckDays >= 2 ? `tắc ${p.workOrders.stuckDays} ngày` : "ổn"}
            tone={p.workOrders.carried > 0 ? "warn" : "good"}
          />
          <MetricBox
            href={`/projects/${p.id}/eod`}
            icon={<BadgeCheck className="h-3.5 w-3.5" />}
            label="EOD hôm nay"
            value={p.eod.submittedToday ? "✓" : "✕"}
            sub={p.eod.submittedToday ? "đã nộp" : "chưa nộp"}
            tone={p.eod.submittedToday ? "good" : "danger"}
          />
          <MetricBox
            href={`/projects/${p.id}/eod`}
            icon={<ShieldAlert className="h-3.5 w-3.5" />}
            label="QC chờ duyệt"
            value={p.qc.pendingReview}
            sub={p.qc.failedThisWeek > 0 ? `${p.qc.failedThisWeek} fail tuần này` : "ổn"}
            tone={p.qc.pendingReview > 0 || p.qc.failedThisWeek > 0 ? "warn" : "good"}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Link href={`/projects/${p.id}/payroll?week=${p.payroll.weekKey}`} className="rounded-lg border border-[#2d3249] bg-[#171a27] p-3 hover:bg-[#22263a]">
            <div className="flex items-baseline justify-between">
              <div className="text-xs text-[#8892b0]">Lương tuần {p.payroll.weekKey}</div>
              <div className="text-xs text-[#cdd6f4]">{payrollLabel(p.payroll.status)}</div>
            </div>
            <div className="mt-1 text-xl font-bold text-emerald-300">{fmtMoney(p.payroll.totalPayable)}</div>
            <div className="mt-1 text-[10px] text-[#8892b0]">
              Bonus pool: {fmtMoney(p.payroll.bonusPool)}
              {p.payroll.negStreak > 0 && <span className="ml-2 text-amber-300">• âm {p.payroll.negStreak} tuần</span>}
            </div>
          </Link>
          <Link href={`/projects/${p.id}/construction-log`} className="rounded-lg border border-[#2d3249] bg-[#171a27] p-3 hover:bg-[#22263a]">
            <div className="text-xs text-[#8892b0]">Nhật ký công trình</div>
            <div className="mt-1 inline-flex items-center gap-1 text-sm text-orange-200">
              Xem log gần nhất <ChevronRight className="h-3 w-3" />
            </div>
          </Link>
        </div>

        {p.alerts.length > 0 && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-red-300">Cảnh báo</div>
            <ul className="space-y-1 text-xs text-[#cdd6f4]">
              {p.alerts.map((a, idx) => (
                <li key={idx} className="flex items-center gap-2">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-400" />
                  {a}
                </li>
              ))}
            </ul>
          </div>
        )}

        {expanded && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <QuickAction href={`/projects/${p.id}/budget`} label="Dự toán" />
            <QuickAction href={`/projects/${p.id}/work-orders`} label="Phiếu giao việc" />
            <QuickAction href={`/projects/${p.id}/eod`} label="Cuối ngày (EOD)" />
            <QuickAction href={`/projects/${p.id}/payroll`} label="Lương tuần" />
            <QuickAction href={`/projects/${p.id}/qc-mapping`} label="QC checklist" />
            <QuickAction href={`/projects/${p.id}/members`} label="Thành viên" />
            <QuickAction href={`/projects/${p.id}/material-proposals`} label="Đề xuất VT" />
            <QuickAction href={`/projects/${p.id}/construction-log`} label="Nhật ký" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MetricBox({ href, icon, label, value, sub, tone }: { href: string; icon: React.ReactNode; label: string; value: string | number; sub: string; tone: "good" | "warn" | "danger" | "info" }) {
  const valueClass = tone === "danger" ? "text-red-300" : tone === "warn" ? "text-amber-300" : tone === "info" ? "text-sky-300" : "text-emerald-300";
  return (
    <Link href={href} className="block rounded-lg border border-[#2d3249] bg-[#171a27] p-3 hover:bg-[#22263a]">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-[#8892b0]">
        {icon} {label}
      </div>
      <div className={`mt-1 text-xl font-bold ${valueClass}`}>{value}</div>
      <div className="mt-0.5 text-[10px] text-[#8892b0]">{sub}</div>
    </Link>
  );
}

function QuickAction({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="rounded-md border border-[#2d3249] bg-[#171a27] px-3 py-2 text-center text-xs text-[#cdd6f4] hover:bg-[#22263a] hover:text-orange-200">
      {label}
    </Link>
  );
}
