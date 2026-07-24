"use client";

import Link from "next/link";
import { AlertTriangle, ChevronRight } from "lucide-react";
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
  attendance: {
    present: number;
    absentP: number;
    absentKP: number;
    absentMUA: number;
    absentCHO: number;
    total: number;
  };
  ksOps: {
    ksId: string | null;
    ksName: string | null;
    checkInAt: string | null;
    checkOutAt: string | null;
    morningCheckin: boolean;
    workersMarked: number;
    workersActive: number;
    tasksDone: number;
    tasksTotal: number;
    eveningReportSubmitted: boolean;
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

function daysUntil(targetIso: string): number {
  const target = new Date(targetIso + "T00:00:00Z").getTime();
  const now = Date.now();
  return Math.ceil((target - now) / (24 * 3600 * 1000));
}

function pctTone(pct: number) {
  if (pct >= 90) return "text-red-300";
  if (pct >= 75) return "text-amber-300";
  return "text-emerald-300";
}

function pctOf(planned: number, used: number) {
  return planned > 0 ? Math.round((used / planned) * 100) : 0;
}

export function ProjectCard({ project }: { project: ProjectMetrics }) {
  const p = project;
  const remainDays = daysUntil(p.expectedEndDate);
  const remainText = remainDays >= 0 ? `còn ${remainDays} ngày tới hạn` : `trễ ${Math.abs(remainDays)} ngày`;
  const remainTone = remainDays < 0 ? "text-red-300" : remainDays <= 7 ? "text-amber-300" : "text-[#cdd6f4]";

  const laborPct = pctOf(p.budget.labor.planned, p.budget.labor.used);
  const matPct = pctOf(p.budget.material.planned, p.budget.material.used);
  const eqPct = pctOf(p.budget.equipment.planned, p.budget.equipment.used);

  const absentTotal = p.attendance.absentP + p.attendance.absentKP + p.attendance.absentMUA + p.attendance.absentCHO;
  const ks = p.ksOps;
  const fmtTime = (iso: string | null) => {
    if (!iso) return "—";
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };
  const attendanceText = ks.checkInAt || ks.checkOutAt ? `Vào ${fmtTime(ks.checkInAt)} · Ra ${fmtTime(ks.checkOutAt)}` : "Chưa chấm công";
  const attendanceTone: "good" | "warn" | "danger" | "muted" = ks.checkInAt && ks.checkOutAt ? "good" : ks.checkInAt ? "warn" : "danger";

  return (
    <Card className="border-[#252840] bg-[#1a1d2e]">
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#252840] pb-2">
          <div className="min-w-0">
            <Link href={`/projects/${p.id}`} className="text-base font-semibold text-orange-200 hover:underline">
              {p.code} — {p.name}
            </Link>
            <div className="mt-0.5 text-xs text-[#8892b0]">
              {p.mainEngineer ? (
                <Link href={`/projects/${p.id}/members`} className="hover:underline">
                  Kỹ sư {p.mainEngineer.name}
                </Link>
              ) : (
                <span>Chưa có kỹ sư</span>
              )}
              {" · "}
              {statusLabel(p.status)}
              {" · "}
              <span className={remainTone}>{remainText}</span>
            </div>
          </div>
          <Link
            href={`/projects/${p.id}`}
            className="inline-flex items-center gap-1 rounded-md border border-[#2d3249] px-2.5 py-1 text-xs text-[#cdd6f4] hover:bg-[#22263a] hover:text-orange-200"
          >
            Chi tiết dự án <ChevronRight className="h-3 w-3" />
          </Link>
        </div>

        {ks.ksId && (
          <Section title={`Kỹ sư ${ks.ksName ?? ""}`.trim()}>
            <MetricLine
              href={`/admin/attendance?userId=${ks.ksId}`}
              label="Chấm công"
              value={attendanceText}
              tone={attendanceTone}
            />
            <MetricLine
              href={`/reports`}
              label="Checkin sáng"
              value={ks.morningCheckin ? "Đã checkin" : "Chưa checkin"}
              tone={ks.morningCheckin ? "good" : "danger"}
            />
            <MetricLine
              href={`/projects/${p.id}/eod`}
              label="Chấm công thợ"
              value={ks.workersActive > 0 ? `${ks.workersMarked}/${ks.workersActive} thợ` : ks.workersMarked > 0 ? `${ks.workersMarked} thợ` : "Chưa chấm"}
              tone={ks.workersActive === 0 ? "muted" : ks.workersMarked >= ks.workersActive ? "good" : ks.workersMarked > 0 ? "warn" : "danger"}
            />
            <MetricLine
              href={`/reports`}
              label="Nhiệm vụ hoàn thành"
              value={ks.tasksTotal > 0 ? `${ks.tasksDone}/${ks.tasksTotal}` : "Chưa có"}
              tone={ks.tasksTotal === 0 ? "muted" : ks.tasksDone >= ks.tasksTotal ? "good" : "warn"}
            />
            <MetricLine
              href={`/reports`}
              label="Báo cáo chiều"
              value={ks.eveningReportSubmitted ? "Đã nộp" : "Chưa nộp"}
              tone={ks.eveningReportSubmitted ? "good" : "danger"}
            />
          </Section>
        )}

        <Section title="Hôm nay">
          <MetricLine
            href={`/projects/${p.id}/work-orders`}
            label="Phiếu giao việc"
            value={p.workOrders.todayTotal === 0 ? "Chưa giao" : `${p.workOrders.todayDone}/${p.workOrders.todayTotal} xong`}
            sub={p.workOrders.todayOpen > 0 ? `${p.workOrders.todayOpen} chưa xong` : ""}
            tone={p.workOrders.todayOpen > 0 ? "warn" : p.workOrders.todayTotal === 0 ? "muted" : "good"}
          />
          <MetricLine
            href={`/projects/${p.id}/work-orders?status=carried`}
            label="Phiếu chuyển ngày"
            value={p.workOrders.carried}
            sub={p.workOrders.stuckDays >= 2 ? `tắc ${p.workOrders.stuckDays} ngày liên tiếp` : ""}
            tone={p.workOrders.carried > 0 ? "warn" : "muted"}
          />
          <MetricLine
            href={`/projects/${p.id}/eod`}
            label="Thợ có mặt"
            value={`${p.attendance.present}/${p.attendance.total}`}
            sub={
              absentTotal > 0
                ? [
                    p.attendance.absentP > 0 ? `${p.attendance.absentP} phép` : "",
                    p.attendance.absentKP > 0 ? `${p.attendance.absentKP} không phép` : "",
                    p.attendance.absentMUA > 0 ? `${p.attendance.absentMUA} mưa` : "",
                    p.attendance.absentCHO > 0 ? `${p.attendance.absentCHO} chờ việc` : "",
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : p.attendance.total === 0
                  ? "chưa chấm công"
                  : "đầy đủ"
            }
            tone={p.attendance.absentKP > 0 ? "danger" : absentTotal > 0 ? "warn" : p.attendance.total === 0 ? "muted" : "good"}
          />
          <MetricLine
            href={`/projects/${p.id}/eod`}
            label="Báo cáo cuối ngày"
            value={p.eod.submittedToday ? "Đã nộp" : "Chưa nộp"}
            tone={p.eod.submittedToday ? "good" : "danger"}
          />
          <MetricLine
            href={`/projects/${p.id}/eod`}
            label="Sản lượng chờ nghiệm thu"
            value={p.qc.pendingReview}
            sub={p.qc.failedThisWeek > 0 ? `${p.qc.failedThisWeek} fail tuần này` : ""}
            tone={p.qc.pendingReview > 0 ? "warn" : "muted"}
          />
        </Section>

        <Section title="Tuần & dự toán">
          <MetricLine
            href={`/projects/${p.id}/budget?cat=labor`}
            label="Nhân công đã dùng"
            value={`${laborPct}%`}
            sub={p.budget.labor.planned > 0 ? `${fmtMoney(p.budget.labor.used)} / ${fmtMoney(p.budget.labor.planned)}` : "chưa lập dự toán"}
            valueClass={pctTone(laborPct)}
          />
          <MetricLine
            href={`/projects/${p.id}/budget?cat=material`}
            label="Vật tư đã dùng"
            value={`${matPct}%`}
            sub={p.budget.material.planned > 0 ? `${fmtMoney(p.budget.material.used)} / ${fmtMoney(p.budget.material.planned)}` : "chưa lập dự toán"}
            valueClass={pctTone(matPct)}
          />
          <MetricLine
            href={`/projects/${p.id}/budget?cat=equipment`}
            label="Máy móc đã dùng"
            value={`${eqPct}%`}
            sub={p.budget.equipment.planned > 0 ? `${fmtMoney(p.budget.equipment.used)} / ${fmtMoney(p.budget.equipment.planned)}` : "chưa lập dự toán"}
            valueClass={pctTone(eqPct)}
          />
          <MetricLine
            href={`/projects/${p.id}/payroll?week=${p.payroll.weekKey}`}
            label={`Lương tuần ${p.payroll.weekKey}`}
            value={fmtMoney(p.payroll.totalPayable)}
            sub={`${payrollLabel(p.payroll.status)}${p.payroll.negStreak > 0 ? ` · âm ${p.payroll.negStreak} tuần` : ""}`}
            tone={p.payroll.negStreak >= 2 ? "danger" : p.payroll.status === "draft" ? "warn" : "good"}
          />
        </Section>

        {p.alerts.length > 0 && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-2.5">
            <div className="mb-1 inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-red-300">
              <AlertTriangle className="h-3 w-3" /> Cảnh báo cần xử lý
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[#8892b0]">{title}</div>
      <div className="divide-y divide-[#252840] rounded-lg border border-[#2d3249] bg-[#171a27]">
        {children}
      </div>
    </div>
  );
}

function MetricLine({
  href,
  label,
  value,
  sub,
  tone = "default",
  valueClass,
}: {
  href: string;
  label: string;
  value: string | number;
  sub?: string;
  tone?: "good" | "warn" | "danger" | "muted" | "default";
  valueClass?: string;
}) {
  const cls =
    valueClass ??
    (tone === "danger"
      ? "text-red-300"
      : tone === "warn"
        ? "text-amber-300"
        : tone === "good"
          ? "text-emerald-300"
          : tone === "muted"
            ? "text-[#8892b0]"
            : "text-[#cdd6f4]");
  return (
    <Link href={href} className="flex items-center justify-between gap-3 px-3 py-1.5 text-sm hover:bg-[#22263a]">
      <span className="text-[#cdd6f4]">{label}</span>
      <span className="flex items-baseline gap-2 text-right">
        {sub && <span className="text-[11px] text-[#8892b0]">{sub}</span>}
        <span className={`font-semibold ${cls}`}>{value}</span>
      </span>
    </Link>
  );
}
