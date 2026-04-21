"use client";

import Link from "next/link";
import {
  AlertTriangle,
  Bell,
  Briefcase,
  CalendarClock,
  CheckCircle2,
  Clock3,
  DollarSign,
  FolderKanban,
  Hammer,
  ListTodo,
  ShieldAlert,
  TrendingUp,
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
};

type PaymentLite = {
  id: string;
  phaseNumber: number;
  milestoneDescription: string;
  expectedDate: string;
  amount: number;
  status: "not_collected" | "request_sent" | "collected" | "customer_late";
  project: { id: string; code: string; name: string };
};

type ProjectLite = { id: string; code: string; name: string; createdAt: string };

type DashboardData = {
  role: Role;
  cards: Array<{ key: string; label: string; value: number | string; tone: "good" | "warn" | "danger" | "info" }>;
  admin?: {
    delayedTasks: TaskLite[];
    recentProjects: ProjectLite[];
  };
  engineer?: {
    todayTasks: TaskLite[];
    upcomingMilestones: TaskLite[];
  };
  foreman?: {
    weekTasks: TaskLite[];
    upcomingMilestones: TaskLite[];
    materialsCount: number;
  };
  accountant?: {
    upcomingPayments: PaymentLite[];
    latePayments: PaymentLite[];
  };
};

function toneClass(tone: "good" | "warn" | "danger" | "info") {
  if (tone === "good") return "text-emerald-600";
  if (tone === "warn") return "text-amber-600";
  if (tone === "danger") return "text-red-600";
  return "text-slate-700";
}

function fmtDate(dateIso: string) {
  const d = new Date(dateIso);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function fmtMoney(v: number) {
  return `${Math.round(v).toLocaleString("vi-VN")} đ`;
}

function EmptyState({ text, href, action }: { text: string; href: string; action: string }) {
  return (
    <div className="rounded-lg border border-dashed p-6 text-center text-sm text-slate-600">
      <p className="mb-3">{text}</p>
      <Link href={href} className="inline-flex">
        <Button variant="outline">{action}</Button>
      </Link>
    </div>
  );
}

export function DashboardClient({ data }: { data: DashboardData }) {
  const iconMap: Record<string, React.ReactNode> = {
    admin_projects: <FolderKanban className="h-4 w-4" />,
    admin_delayed: <ShieldAlert className="h-4 w-4" />,
    admin_in_progress: <Hammer className="h-4 w-4" />,
    admin_payment_due: <DollarSign className="h-4 w-4" />,
    cm_projects: <FolderKanban className="h-4 w-4" />,
    cm_delayed: <ShieldAlert className="h-4 w-4" />,
    cm_in_progress: <Hammer className="h-4 w-4" />,
    engineer_today: <ListTodo className="h-4 w-4" />,
    engineer_delayed: <AlertTriangle className="h-4 w-4" />,
    engineer_next3: <Clock3 className="h-4 w-4" />,
    engineer_projects: <Briefcase className="h-4 w-4" />,
    foreman_week: <CalendarClock className="h-4 w-4" />,
    foreman_materials: <Wrench className="h-4 w-4" />,
    accountant_due7: <Bell className="h-4 w-4" />,
    accountant_late: <AlertTriangle className="h-4 w-4" />,
    accountant_collected_month: <CheckCircle2 className="h-4 w-4" />,
    accountant_expected_month: <TrendingUp className="h-4 w-4" />,
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {data.cards.map((card) => (
          <Card key={card.key}>
            <CardHeader className="pb-1">
              <CardTitle className="flex items-center gap-2">
                {iconMap[card.key] || <Briefcase className="h-4 w-4" />} {card.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-3xl font-bold ${toneClass(card.tone)}`}>{card.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {data.role === "admin" || data.role === "construction_manager" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Top 10 task trễ mới nhất</CardTitle>
            </CardHeader>
            <CardContent>
              {data.admin?.delayedTasks?.length ? (
                <div className="space-y-2">
                  {data.admin.delayedTasks.map((t) => (
                    <Link key={t.id} href={`/tasks/${t.id}`} className="block rounded border p-2 hover:bg-slate-50">
                      <div className="text-sm font-medium">{t.code} - {t.name}</div>
                      <div className="text-xs text-slate-600">
                        {t.project.code} • KS: {t.assignedEngineer?.fullName || "-"} • Hạn: {fmtDate(t.plannedEndDate)}
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
                  {data.admin.recentProjects.map((p) => (
                    <Link key={p.id} href={`/projects/${p.id}`} className="block rounded border p-2 hover:bg-slate-50">
                      <div className="text-sm font-medium">{p.code} - {p.name}</div>
                      <div className="text-xs text-slate-600">Tạo: {fmtDate(p.createdAt)}</div>
                    </Link>
                  ))}
                </div>
              ) : (
                <EmptyState text="Chưa có dự án nào." href="/projects/new" action="Tạo dự án" />
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {data.role === "engineer" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Task hôm nay của bạn</CardTitle>
            </CardHeader>
            <CardContent>
              {data.engineer?.todayTasks?.length ? (
                <div className="space-y-2">
                  {data.engineer.todayTasks.map((t) => (
                    <div key={t.id} className="rounded border p-2">
                      <div className="mb-1 flex items-center justify-between">
                        <Link href={`/tasks/${t.id}`} className="text-sm font-medium hover:underline">
                          {t.code} - {t.name}
                        </Link>
                        <span className={`rounded-full px-2 py-1 text-xs ${STATUS_CLASS[t.status]}`}>{STATUS_LABEL[t.status]}</span>
                      </div>
                      <div className="text-xs text-slate-600">{t.project.code} • Hạn: {fmtDate(t.plannedEndDate)}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState text="Bạn chưa có công việc nào hôm nay." href="/projects" action="Xem tiến độ" />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Milestone sắp đến 7 ngày</CardTitle>
            </CardHeader>
            <CardContent>
              {data.engineer?.upcomingMilestones?.length ? (
                <div className="space-y-2">
                  {data.engineer.upcomingMilestones.map((t) => (
                    <Link key={t.id} href={`/tasks/${t.id}`} className="block rounded border border-red-200 bg-red-50 p-2">
                      <div className="text-sm font-medium">{t.code} - {t.name}</div>
                      <div className="text-xs text-red-700">{t.project.code} • {fmtDate(t.plannedStartDate)}</div>
                    </Link>
                  ))}
                </div>
              ) : (
                <EmptyState text="Không có milestone sắp đến." href="/projects" action="Xem dự án" />
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {data.role === "foreman" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Task tuần này của đội</CardTitle>
            </CardHeader>
            <CardContent>
              {data.foreman?.weekTasks?.length ? (
                <div className="space-y-2">
                  {data.foreman.weekTasks.map((t) => (
                    <Link key={t.id} href={`/tasks/${t.id}`} className="block rounded border p-2 hover:bg-slate-50">
                      <div className="text-sm font-medium">{t.code} - {t.name}</div>
                      <div className="text-xs text-slate-600">{fmtDate(t.plannedStartDate)} → {fmtDate(t.plannedEndDate)}</div>
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
                  {data.foreman.upcomingMilestones.map((t) => (
                    <Link key={t.id} href={`/tasks/${t.id}`} className="block rounded border border-amber-200 bg-amber-50 p-2">
                      <div className="text-sm font-medium">{t.code} - {t.name}</div>
                      <div className="text-xs text-amber-700">{t.project.code} • {fmtDate(t.plannedStartDate)}</div>
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

      {data.role === "accountant" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Lịch thanh toán sắp đến</CardTitle>
            </CardHeader>
            <CardContent>
              {data.accountant?.upcomingPayments?.length ? (
                <div className="space-y-2">
                  {data.accountant.upcomingPayments.map((p) => (
                    <Link key={p.id} href={`/projects/${p.project.id}/payments`} className="block rounded border p-2 hover:bg-slate-50">
                      <div className="text-sm font-medium">{p.project.code} - Đợt {p.phaseNumber}</div>
                      <div className="text-xs text-slate-600">{fmtDate(p.expectedDate)} • {fmtMoney(p.amount)}</div>
                    </Link>
                  ))}
                </div>
              ) : (
                <EmptyState text="Không có đợt thanh toán sắp đến." href="/projects" action="Xem dự án" />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Đợt thanh toán trễ</CardTitle>
            </CardHeader>
            <CardContent>
              {data.accountant?.latePayments?.length ? (
                <div className="space-y-2">
                  {data.accountant.latePayments.map((p) => (
                    <Link key={p.id} href={`/projects/${p.project.id}/payments`} className="block rounded border border-red-200 bg-red-50 p-2">
                      <div className="text-sm font-medium">{p.project.code} - Đợt {p.phaseNumber}</div>
                      <div className="text-xs text-red-700">Quá hạn {fmtDate(p.expectedDate)} • {fmtMoney(p.amount)}</div>
                    </Link>
                  ))}
                </div>
              ) : (
                <EmptyState text="Không có đợt thanh toán trễ." href="/projects" action="Xem dự án" />
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
