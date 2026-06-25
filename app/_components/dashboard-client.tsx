"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { TreasuryClient } from "@/app/treasury/_components/treasury-client";
import { ExpensesClient } from "@/app/expenses/_components/expenses-client";
import {
  AlertTriangle,
  Bell,
  Briefcase,
  CalendarClock,
  ChevronRight,
  ClipboardList,
  Clock3,
  DollarSign,
  FolderKanban,
  Hammer,
  ListTodo,
  Receipt,
  ShieldAlert,
  ShoppingCart,
  TrendingUp,
  UserPlus,
  Wallet,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { STATUS_CLASS, STATUS_LABEL } from "@/lib/task-display";

type Role = "admin" | "engineer" | "foreman" | "accountant" | "construction_manager";

type TaskLite = {
  id: string;
  code: string;
  name: string;
  status: "not_started" | "in_progress" | "done" | "inspected" | "delayed" | "na";
  plannedStartDate: string;
  plannedEndDate: string;
  isMilestone: boolean;
  project: { id: string; code: string; name: string };
  assignedEngineer?: { id: string; fullName: string | null } | null;
  reportGroup?: "overdue" | "running" | "starting";
  morningDecision?: "WORK" | "PAUSE" | null;
};

type ProjectLite = { id: string; code: string; name: string; createdAt: string };

type DashboardData = {
  role: Role;
  cards: Array<{ key: string; label: string; value: number | string; tone: "good" | "warn" | "danger" | "info" }>;
  admin?: {
    delayedTasks: TaskLite[];
    recentProjects: ProjectLite[];
    missingMorning?: Array<{
      projectId: string;
      projectCode: string;
      projectName: string;
      engineerId: string;
      engineerName: string;
    }>;
    missingEvening?: Array<{
      projectId: string;
      projectCode: string;
      projectName: string;
      engineerId: string;
      engineerName: string;
    }>;
    issueProjects?: Array<{
      projectId: string;
      projectCode: string;
      projectName: string;
      underCount: number;
    }>;
    topKpi?: Array<{
      userId: string;
      fullName: string;
      email: string;
      projectCount: number;
      score: number;
      rank: string;
    }>;
    bottomKpi?: Array<{
      userId: string;
      fullName: string;
      email: string;
      projectCount: number;
      score: number;
      rank: string;
    }>;
  };
  engineer?: {
    todayTasks: TaskLite[];
    taskGroups?: {
      overdue: TaskLite[];
      running: TaskLite[];
      starting: TaskLite[];
    };
    reportStatus?: Array<{
      projectId: string;
      projectCode: string;
      projectName: string;
      isActive: boolean;
      isRestDay: boolean;
      restReason: string | null;
      morningLabel: string;
      morningTone: "good" | "warn" | "danger" | "info";
      eveningLabel: string;
      eveningTone: "good" | "warn" | "danger" | "info";
      morningSubmitted: boolean;
      eveningSubmitted: boolean;
    }>;
    kpiMonth?: {
      score: number;
      rank: string;
      projectId: string | null;
      projectCode: string | null;
      projectName: string | null;
    } | null;
    upcomingMilestones: TaskLite[];
  };
  foreman?: {
    weekTasks: TaskLite[];
    upcomingMilestones: TaskLite[];
    materialsCount: number;
  };
  accountant?: {
    expensePayment: {
      total: number;
      payroll: number;
      subPayment: number;
      materialReceived: number;
    };
    newWorker: { missingInfo: number };
    proposalPending: number;
    expensePending: { count: number; total: number; urgentCount: number };
    treasury: { initialized: boolean; balance: number };
  };
};

function toneClass(tone: "good" | "warn" | "danger" | "info") {
  if (tone === "good") return "text-emerald-600";
  if (tone === "warn") return "text-amber-600";
  if (tone === "danger") return "text-red-600";
  return "text-slate-700";
}

function toneBadge(tone: "good" | "warn" | "danger" | "info") {
  if (tone === "good") return "bg-emerald-100 text-emerald-700";
  if (tone === "warn") return "bg-amber-100 text-amber-700";
  if (tone === "danger") return "bg-red-100 text-red-700";
  return "bg-slate-100 text-slate-700";
}

function fmtDate(dateIso: string) {
  const d = new Date(dateIso);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function rankClass(rank: string) {
  if (rank === "A") return "bg-emerald-100 text-emerald-700";
  if (rank === "B") return "bg-blue-100 text-blue-700";
  if (rank === "C") return "bg-amber-100 text-amber-700";
  return "bg-red-100 text-red-700";
}

function morningDecisionLabel(value: "WORK" | "PAUSE" | null | undefined) {
  if (value === "WORK") return "WORK";
  if (value === "PAUSE") return "PAUSE";
  return "-";
}

function TaskGroupBadge({ group }: { group: "overdue" | "running" | "starting" | undefined }) {
  if (group === "overdue") {
    return <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">TRỄ HẠN</span>;
  }
  if (group === "running") {
    return <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">ĐANG CHẠY</span>;
  }
  if (group === "starting") {
    return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">SẮP BẮT ĐẦU</span>;
  }
  return null;
}

function EmptyState({ text, href, action }: { text: string; href: string; action: string }) {
  return (
    <div className="rounded-xl border border-dashed border-[#3a3f58] bg-[#171a27] p-6 text-center text-sm text-[#8892b0]">
      <p className="mb-3">{text}</p>
      <Link href={href} className="inline-flex">
        <Button variant="outline">{action}</Button>
      </Link>
    </div>
  );
}

function ReportStatusCard({
  rows,
}: {
  rows: NonNullable<DashboardData["engineer"]>["reportStatus"];
}) {
  if (!rows || rows.length === 0) {
    return <EmptyState text="Không có dự án báo cáo hôm nay." href="/reports" action="Vào báo cáo" />;
  }

  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div key={row.projectId} className="rounded-xl border border-[#2d3249] bg-[#171a27] p-3 text-sm">
          <div className="mb-1 font-medium">
            {row.projectCode} - {row.projectName}
          </div>
          <div className="mb-2 flex flex-wrap gap-2">
            <span className={`rounded-full px-2 py-0.5 text-xs ${toneBadge(row.morningTone)}`}>Sáng: {row.morningLabel}</span>
            <span className={`rounded-full px-2 py-0.5 text-xs ${toneBadge(row.eveningTone)}`}>Chiều: {row.eveningLabel}</span>
          </div>
          {row.isActive && !row.isRestDay ? (
            <Link href="/reports" className="inline-flex">
              <Button variant="outline" size="sm">
                Vào nhiệm vụ hôm nay
              </Button>
            </Link>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function TaskGroupsCard({
  groups,
}: {
  groups: NonNullable<NonNullable<DashboardData["engineer"]>["taskGroups"]>;
}) {
  const renderGroup = (title: string, rows: TaskLite[], group: "overdue" | "running" | "starting") => (
    <div className="space-y-2">
      <div className="flex items-center gap-1 text-sm font-semibold text-slate-700">
        {group === "overdue" ? <AlertTriangle className="h-4 w-4 text-red-600" /> : null}
        <span>{title}</span>
      </div>
      {rows.length ? (
        rows.map((task) => (
          <div key={task.id} className="rounded-xl border border-[#2d3249] bg-[#171a27] p-2">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <TaskGroupBadge group={task.reportGroup} />
              <Link href={`/tasks/${task.id}`} className="text-sm font-medium text-[#f0f2ff] hover:underline">
                {task.code} - {task.name}
              </Link>
            </div>
            <div className="text-xs text-[#8892b0]">
              {task.project.code} • Hạn: {fmtDate(task.plannedEndDate)} • Sáng: {morningDecisionLabel(task.morningDecision)}
            </div>
          </div>
        ))
      ) : (
        <div className="rounded-xl border border-dashed border-[#3a3f58] p-2 text-xs text-[#8892b0]">Không có task.</div>
      )}
    </div>
  );

  return (
    <div className="space-y-3">
      {renderGroup("TRỄ HẠN", groups.overdue, "overdue")}
      {renderGroup("ĐANG CHẠY", groups.running, "running")}
      {renderGroup("SẮP BẮT ĐẦU", groups.starting, "starting")}
    </div>
  );
}

export function DashboardClient({ data }: { data: DashboardData }) {
  const iconMap: Record<string, React.ReactNode> = {
    admin_projects: <FolderKanban className="h-4 w-4" />,
    admin_delayed: <ShieldAlert className="h-4 w-4" />,
    admin_in_progress: <Hammer className="h-4 w-4" />,
    admin_payment_due: <DollarSign className="h-4 w-4" />,
    admin_missing_morning: <Clock3 className="h-4 w-4" />,
    admin_missing_evening: <Clock3 className="h-4 w-4" />,
    admin_issue_projects: <AlertTriangle className="h-4 w-4" />,
    cm_projects: <FolderKanban className="h-4 w-4" />,
    cm_delayed: <ShieldAlert className="h-4 w-4" />,
    cm_in_progress: <Hammer className="h-4 w-4" />,
    cm_missing_morning: <Clock3 className="h-4 w-4" />,
    cm_missing_evening: <Clock3 className="h-4 w-4" />,
    cm_issue_projects: <AlertTriangle className="h-4 w-4" />,
    engineer_today: <ListTodo className="h-4 w-4" />,
    engineer_delayed: <AlertTriangle className="h-4 w-4" />,
    engineer_next3: <Clock3 className="h-4 w-4" />,
    engineer_projects: <Briefcase className="h-4 w-4" />,
    engineer_report_today: <Bell className="h-4 w-4" />,
    engineer_kpi_month: <TrendingUp className="h-4 w-4" />,
    foreman_week: <CalendarClock className="h-4 w-4" />,
    foreman_materials: <Wrench className="h-4 w-4" />,
  };

  const cardAnchorMap: Record<string, string> = {
    admin_missing_morning: "#missing-morning-list",
    cm_missing_morning: "#missing-morning-list",
    admin_missing_evening: "#missing-evening-list",
    cm_missing_evening: "#missing-evening-list",
    admin_issue_projects: "#issue-projects-list",
    cm_issue_projects: "#issue-projects-list",
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 grid-cols-2">
        {data.cards.map((card) => {
          const anchor = cardAnchorMap[card.key];
          const cardNode = (
            <Card className={`border-[#252840] bg-[#1a1d2e] ${anchor ? "cursor-pointer transition-colors hover:bg-[#22263a]" : ""}`}>
              <CardHeader className="pb-1">
                <CardTitle className="flex items-center gap-2">
                  {iconMap[card.key] || <Briefcase className="h-4 w-4" />} {card.label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-3xl font-bold ${toneClass(card.tone)}`}>{card.value}</div>
              </CardContent>
            </Card>
          );

          if (anchor) {
            return (
              <Link key={card.key} href={anchor} className="block rounded-xl">
                {cardNode}
              </Link>
            );
          }

          return <div key={card.key}>{cardNode}</div>;
        })}
      </div>

      {data.role === "admin" || data.role === "construction_manager" ? (
        <div className="space-y-4">
          <div className="grid gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Top 10 task trễ mới nhất</CardTitle>
              </CardHeader>
              <CardContent>
                {data.admin?.delayedTasks?.length ? (
                  <div className="space-y-2">
                    {data.admin.delayedTasks.map((task) => (
                      <Link key={task.id} href={`/tasks/${task.id}`} className="block rounded-xl border border-[#2d3249] bg-[#171a27] p-2 hover:bg-[#22263a]">
                        <div className="text-sm font-medium">
                          {task.code} - {task.name}
                        </div>
                        <div className="text-xs text-[#8892b0]">
                          {task.project.code} • KS: {task.assignedEngineer?.fullName || "-"} • Hạn: {fmtDate(task.plannedEndDate)}
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <EmptyState text="Chưa có task trễ." href="/projects" action="Xem dự án" />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>5 dự án gần đây</CardTitle>
              </CardHeader>
              <CardContent>
                {data.admin?.recentProjects?.length ? (
                  <div className="space-y-2">
                    {data.admin.recentProjects.map((project) => (
                      <Link key={project.id} href={`/projects/${project.id}`} className="block rounded-xl border border-[#2d3249] bg-[#171a27] p-2 hover:bg-[#22263a]">
                        <div className="text-sm font-medium">
                          {project.code} - {project.name}
                        </div>
                        <div className="text-xs text-[#8892b0]">Tạo: {fmtDate(project.createdAt)}</div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <EmptyState text="Chưa có dự án nào." href="/projects/new" action="Tạo dự án" />
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4">
            <Card id="missing-morning-list">
              <CardHeader>
                <CardTitle>KS chưa báo cáo sáng hôm nay</CardTitle>
              </CardHeader>
              <CardContent>
                {data.admin?.missingMorning?.length ? (
                  <div className="space-y-2 text-sm">
                    {data.admin.missingMorning.map((row) => (
                      <Link key={`${row.projectId}_${row.engineerId}`} href={`/projects/${row.projectId}`} className="block rounded-xl border border-[#2d3249] bg-[#171a27] p-2 hover:bg-[#22263a]">
                        <div className="font-medium">{row.engineerName}</div>
                        <div className="text-xs text-[#8892b0]">
                          {row.projectCode} - {row.projectName}
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-[#8892b0]">Không có KS nào thiếu báo cáo sáng.</div>
                )}
              </CardContent>
            </Card>

            <Card id="missing-evening-list">
              <CardHeader>
                <CardTitle>KS chưa báo cáo chiều hôm nay</CardTitle>
              </CardHeader>
              <CardContent>
                {data.admin?.missingEvening?.length ? (
                  <div className="space-y-2 text-sm">
                    {data.admin.missingEvening.map((row) => (
                      <Link key={`${row.projectId}_${row.engineerId}`} href={`/projects/${row.projectId}`} className="block rounded-xl border border-[#2d3249] bg-[#171a27] p-2 hover:bg-[#22263a]">
                        <div className="font-medium">{row.engineerName}</div>
                        <div className="text-xs text-[#8892b0]">
                          {row.projectCode} - {row.projectName}
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-[#8892b0]">Không có KS nào thiếu báo cáo chiều.</div>
                )}
              </CardContent>
            </Card>

            <Card id="issue-projects-list">
              <CardHeader>
                <CardTitle>Dự án có vấn đề hôm nay</CardTitle>
              </CardHeader>
              <CardContent>
                {data.admin?.issueProjects?.length ? (
                  <div className="space-y-2 text-sm">
                    {data.admin.issueProjects.map((row) => (
                      <Link key={row.projectId} href={`/projects/${row.projectId}/construction-log`} className="block rounded-xl border border-[#2d3249] bg-[#171a27] p-2 hover:bg-[#22263a]">
                        <div className="font-medium">
                          {row.projectCode} - {row.projectName}
                        </div>
                        <div className="text-xs text-[#8892b0]">UNDER hôm nay: {row.underCount}</div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-[#8892b0]">Không có dự án bị UNDER hôm nay.</div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Top 3 KS KPI cao nhất tháng</CardTitle>
              </CardHeader>
              <CardContent>
                {data.admin?.topKpi?.length ? (
                  <div className="space-y-2 text-sm">
                    {data.admin.topKpi.map((row) => (
                      <div key={row.userId} className="rounded-xl border border-[#2d3249] bg-[#171a27] p-2">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <div className="font-medium">{row.fullName}</div>
                            <div className="text-xs text-[#8892b0]">{row.email}</div>
                          </div>
                          <div className="text-right">
                            <div className="font-semibold">{row.score.toFixed(2)}</div>
                            <span className={`rounded-full px-2 py-0.5 text-xs ${rankClass(row.rank)}`}>{row.rank}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-[#8892b0]">Chưa có dữ liệu KPI.</div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Bottom 3 KS KPI thấp nhất tháng</CardTitle>
              </CardHeader>
              <CardContent>
                {data.admin?.bottomKpi?.length ? (
                  <div className="space-y-2 text-sm">
                    {data.admin.bottomKpi.map((row) => (
                      <div key={row.userId} className="rounded-xl border border-[#2d3249] bg-[#171a27] p-2">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <div className="font-medium">{row.fullName}</div>
                            <div className="text-xs text-[#8892b0]">{row.email}</div>
                          </div>
                          <div className="text-right">
                            <div className="font-semibold">{row.score.toFixed(2)}</div>
                            <span className={`rounded-full px-2 py-0.5 text-xs ${rankClass(row.rank)}`}>{row.rank}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-[#8892b0]">Chưa có dữ liệu KPI.</div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      ) : null}

      {data.role === "engineer" ? (
        <div className="space-y-4">
          <div className="grid gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Báo cáo hôm nay</CardTitle>
              </CardHeader>
              <CardContent>
                <ReportStatusCard rows={data.engineer?.reportStatus} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>KPI tháng này</CardTitle>
              </CardHeader>
              <CardContent>
                {data.engineer?.kpiMonth ? (
                  <div className="space-y-3">
                    <div className="text-4xl font-bold text-orange-300">{data.engineer.kpiMonth.score.toFixed(2)}</div>
                    <span className={`inline-flex rounded-full px-3 py-1 text-sm ${rankClass(data.engineer.kpiMonth.rank)}`}>
                      Hạng {data.engineer.kpiMonth.rank}
                    </span>
                    <div className="text-sm text-[#8892b0]">
                      {data.engineer.kpiMonth.projectCode && data.engineer.kpiMonth.projectName
                        ? `${data.engineer.kpiMonth.projectCode} - ${data.engineer.kpiMonth.projectName}`
                        : "Không có dự án KPI"}
                    </div>
                    <Link href="/my-kpi" className="inline-flex">
                      <Button variant="outline">Xem chi tiết</Button>
                    </Link>
                  </div>
                ) : (
                  <EmptyState text="Chưa có dữ liệu KPI tháng này." href="/my-kpi" action="Xem KPI" />
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Task hôm nay (theo nhóm)</CardTitle>
              </CardHeader>
              <CardContent>
                <TaskGroupsCard
                  groups={
                    data.engineer?.taskGroups || {
                      overdue: [],
                      running: [],
                      starting: [],
                    }
                  }
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Milestone sắp đến 7 ngày</CardTitle>
              </CardHeader>
              <CardContent>
                {data.engineer?.upcomingMilestones?.length ? (
                  <div className="space-y-2">
                    {data.engineer.upcomingMilestones.map((task) => (
                      <Link key={task.id} href={`/tasks/${task.id}`} className="block rounded-xl border border-red-500/40 bg-red-500/10 p-2">
                        <div className="text-sm font-medium">
                          {task.code} - {task.name}
                        </div>
                        <div className="text-xs text-red-300">
                          {task.project.code} • {fmtDate(task.plannedStartDate)}
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <EmptyState text="Không có milestone sắp đến." href="/projects" action="Xem dự án" />
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      ) : null}

      {data.role === "foreman" ? (
        <div className="grid gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Task tuần này của đội</CardTitle>
            </CardHeader>
            <CardContent>
              {data.foreman?.weekTasks?.length ? (
                <div className="space-y-2">
                  {data.foreman.weekTasks.map((task) => (
                    <Link key={task.id} href={`/tasks/${task.id}`} className="block rounded-xl border border-[#2d3249] bg-[#171a27] p-2 hover:bg-[#22263a]">
                      <div className="text-sm font-medium">
                        {task.code} - {task.name}
                      </div>
                      <div className="text-xs text-[#8892b0]">
                        {fmtDate(task.plannedStartDate)} → {fmtDate(task.plannedEndDate)}
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <EmptyState text="Bạn chưa có công việc tuần này." href="/projects" action="Xem tiến độ" />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Milestone sắp nghiệm thu</CardTitle>
            </CardHeader>
            <CardContent>
              {data.foreman?.upcomingMilestones?.length ? (
                <div className="space-y-2">
                  {data.foreman.upcomingMilestones.map((task) => (
                    <Link key={task.id} href={`/tasks/${task.id}`} className="block rounded-xl border border-amber-500/40 bg-amber-500/10 p-2">
                      <div className="text-sm font-medium">
                        {task.code} - {task.name}
                      </div>
                      <div className="text-xs text-amber-300">
                        {task.project.code} • {fmtDate(task.plannedStartDate)}
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <EmptyState text="Không có milestone trong 7 ngày tới." href="/projects" action="Xem dự án" />
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {data.role === "accountant" && data.accountant ? <AccountantActions data={data.accountant} /> : null}
    </div>
  );
}

function CountBadge({ value, tone }: { value: number; tone: "warn" | "muted" }) {
  const cls =
    tone === "warn"
      ? "bg-amber-100 text-amber-700"
      : "bg-slate-100 text-slate-600";
  return (
    <span className={`inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-xs font-semibold ${cls}`}>
      {value}
    </span>
  );
}

function ExpenseSubLink({ href, label, value }: { href: string; label: string; value: number }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 hover:bg-slate-50"
    >
      <span className="text-sm text-slate-700">{label}</span>
      <span className="flex items-center gap-2">
        <CountBadge value={value} tone={value > 0 ? "warn" : "muted"} />
        <ChevronRight className="h-4 w-4 text-slate-400" />
      </span>
    </Link>
  );
}

function ActionCard({
  href,
  icon,
  title,
  subtitle,
  badge,
  className,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  badge?: { value: number; tone: "warn" | "muted" };
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:bg-slate-50 ${className ?? ""}`}
    >
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-700">{icon}</div>
        <div>
          <div className="text-sm font-semibold text-slate-900">{title}</div>
          {subtitle ? <div className="text-xs text-slate-500">{subtitle}</div> : null}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {badge ? <CountBadge value={badge.value} tone={badge.tone} /> : null}
        <ChevronRight className="h-5 w-5 text-slate-400" />
      </div>
    </Link>
  );
}

function fmtVndShort(n: number) {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(n % 1_000_000_000 === 0 ? 0 : 1)} tỷ`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)} tr`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return new Intl.NumberFormat("vi-VN").format(Math.round(n));
}

function AccountantActions({ data }: { data: NonNullable<DashboardData["accountant"]> }) {
  const expense = data.expensePayment;
  const pendingExp = data.expensePending;
  const treasury = data.treasury;
  const hasUrgent = pendingExp.urgentCount > 0;
  const balanceTone =
    treasury.balance < 5_000_000
      ? "text-red-600"
      : treasury.balance < 20_000_000
        ? "text-amber-600"
        : "text-emerald-600";
  const balanceText = treasury.balance.toLocaleString("vi-VN", { maximumFractionDigits: 2 });
  const balanceFontSize = balanceText.length > 14 ? "text-base" : balanceText.length > 10 ? "text-lg" : "text-xl";

  const [showTreasury, setShowTreasury] = useState(false);
  const [showExpenses, setShowExpenses] = useState(false);
  const [opts, setOpts] = useState<{
    projects: { id: string; code: string; name: string }[];
    categories: { id: string; code: string; name: string }[];
  } | null>(null);

  useEffect(() => {
    if ((!showTreasury && !showExpenses) || opts) return;
    fetch("/api/treasury/options", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setOpts({ projects: j.projects || [], categories: j.categories || [] }))
      .catch(() => setOpts({ projects: [], categories: [] }));
  }, [showTreasury, showExpenses, opts]);

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {pendingExp.count > 0 && (
          <button
            type="button"
            onClick={() => setShowExpenses(true)}
            className={`slide-up smooth-press flex flex-col gap-2 rounded-xl border p-4 text-left shadow-sm transition ${
              hasUrgent
                ? "border-red-400 bg-red-50 pulse-glow"
                : "border-amber-300 bg-amber-50 hover:bg-amber-100"
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                    hasUrgent ? "bg-red-200 text-red-700" : "bg-orange-100 text-orange-700"
                  }`}
                >
                  <Receipt className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-900">Lệnh chi</div>
                  <div className="text-xs text-slate-500">Admin gửi → chuyển khoản</div>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-slate-400" />
            </div>
            <div className="flex items-baseline justify-between">
              <div className={`text-2xl font-bold ${hasUrgent ? "text-red-700" : "text-amber-700"}`}>
                {pendingExp.count}
              </div>
              <div className="text-right text-xs">
                <div className={`font-semibold ${hasUrgent ? "text-red-700" : "text-slate-600"}`}>
                  {fmtVndShort(pendingExp.total)} đ
                </div>
                {hasUrgent ? (
                  <div className="font-semibold text-red-600">🚨 {pendingExp.urgentCount} GẤP</div>
                ) : (
                  <div className="text-slate-500">chờ chi</div>
                )}
              </div>
            </div>
          </button>
        )}

        <button
          type="button"
          onClick={() => setShowTreasury(true)}
          className={`smooth-press flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:bg-slate-50 ${
            pendingExp.count === 0 ? "sm:col-span-2" : ""
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                <Wallet className="h-5 w-5" />
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-900">Sổ quỹ</div>
                <div className="text-xs text-slate-500">Bấm để xem chi tiết</div>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-slate-400" />
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <div className={`font-bold ${balanceFontSize} ${balanceTone} whitespace-nowrap`}>
              {balanceText} đ
            </div>
            <div className="text-right text-xs">
              {treasury.initialized ? (
                <div className="text-slate-500">tiền mặt + ngân hàng</div>
              ) : (
                <div className="font-semibold text-amber-600">Chưa khai báo số dư</div>
              )}
            </div>
          </div>
        </button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-slate-700" />
            <span>Thanh toán chi phí công trình</span>
            <CountBadge value={expense.total} tone={expense.total > 0 ? "warn" : "muted"} />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <ExpenseSubLink href="/projects" label="Lương tuần chờ chi" value={expense.payroll} />
          <ExpenseSubLink href="/sub-payments" label="Nhà thầu phụ chờ payout" value={expense.subPayment} />
          <ExpenseSubLink href="/proposals" label="Vật tư đã nhận chờ thanh toán" value={expense.materialReceived} />
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <ActionCard
          href="/proposals"
          icon={<ShoppingCart className="h-5 w-5" />}
          title="Yêu cầu mua hàng từ KS"
          subtitle="Duyệt đề nghị vật tư"
          badge={{ value: data.proposalPending, tone: data.proposalPending > 0 ? "warn" : "muted" }}
        />
        <ActionCard
          href="/admin/workers"
          icon={<UserPlus className="h-5 w-5" />}
          title="Nhập thông tin thợ"
          subtitle="Thợ thiếu CCCD/STK"
          badge={{ value: data.newWorker.missingInfo, tone: data.newWorker.missingInfo > 0 ? "warn" : "muted" }}
        />
        <ActionCard
          href="/admin/attendance"
          icon={<ClipboardList className="h-5 w-5" />}
          title="Chấm công nhân viên"
          subtitle="KS / KT / quản lý"
          className="sm:col-span-2"
        />
      </div>

      {showExpenses && (
        <div
          className="modal-backdrop-in fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-2 pt-4"
          onClick={() => setShowExpenses(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="modal-panel-in w-full max-w-6xl rounded-xl bg-[#0b0d16] shadow-xl text-[#cfd4e8] border border-[#2d3249]"
          >
            <div className="sticky top-0 z-10 flex items-center justify-between rounded-t-xl border-b border-[#2d3249] bg-[#13151f] px-4 py-2.5">
              <div className="text-base font-semibold text-orange-300">Lệnh chi — chi tiết</div>
              <button
                onClick={() => setShowExpenses(false)}
                className="rounded-lg px-2 py-1 text-[#8b95b7] hover:bg-[#0b0d16] hover:text-[#f0f2ff]"
                aria-label="Đóng"
              >
                ✕
              </button>
            </div>
            <div className="p-3">
              {opts ? (
                <ExpensesClient role="accountant" projects={opts.projects} categories={opts.categories} />
              ) : (
                <div className="p-6 text-center text-sm text-[#8b95b7]">Đang tải lệnh chi…</div>
              )}
            </div>
          </div>
        </div>
      )}

      {showTreasury && (
        <div
          className="modal-backdrop-in fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-2 pt-4"
          onClick={() => setShowTreasury(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="modal-panel-in w-full max-w-5xl rounded-xl bg-[#0b0d16] shadow-xl text-[#cfd4e8] border border-[#2d3249]"
          >
            <div className="sticky top-0 z-10 flex items-center justify-between rounded-t-xl border-b border-[#2d3249] bg-[#13151f] px-4 py-2.5">
              <div className="text-base font-semibold text-orange-300">Sổ quỹ — chi tiết</div>
              <button
                onClick={() => setShowTreasury(false)}
                className="rounded-lg px-2 py-1 text-[#8b95b7] hover:bg-[#0b0d16] hover:text-[#f0f2ff]"
                aria-label="Đóng"
              >
                ✕
              </button>
            </div>
            <div className="p-3">
              {opts ? (
                <TreasuryClient projects={opts.projects} categories={opts.categories} />
              ) : (
                <div className="p-6 text-center text-sm text-[#8b95b7]">Đang tải sổ quỹ…</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
