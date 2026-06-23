"use client";

import Link from "next/link";
import {
  ArrowLeft,
  Banknote,
  BookOpen,
  Briefcase,
  CalendarClock,
  ChevronRight,
  ClipboardList,
  FileText,
  FolderOpen,
  ListChecks,
  Loader,
  Package,
  Sun,
  Users,
  Wallet,
} from "lucide-react";

type Phase = {
  id: string;
  code: string;
  name: string;
  status: "not_started" | "in_progress" | "completed";
  plannedStartDate: string;
  plannedEndDate: string;
  tasks: {
    id: string;
    code: string;
    name: string;
    status: string;
    plannedEndDate: string | null;
  }[];
};

type Project = {
  id: string;
  code: string;
  name: string;
  customerName: string;
  address: string;
  status: string;
  startDate: string;
  plannedDeadline: string | null;
  expectedEndDate: string;
};

type Props = {
  project: Project;
  phases: Phase[];
  currentRole: string;
};

function statusBadge(status: string): { label: string; bg: string; color: string } {
  switch (status) {
    case "in_progress":
      return { label: "Đang thi công", bg: "rgba(111,166,119,0.18)", color: "#6FA677" };
    case "completed":
      return { label: "Hoàn thành", bg: "rgba(167,139,250,0.18)", color: "#a78bfa" };
    case "paused":
      return { label: "Tạm ngưng", bg: "rgba(224,184,85,0.18)", color: "#E0B855" };
    default:
      return { label: "Đang chuẩn bị", bg: "rgba(154,143,128,0.18)", color: "#9a8f80" };
  }
}

function phaseProgress(p: Phase) {
  const total = p.tasks.length;
  if (total === 0) return { pct: 0, done: 0, total: 0, doing: 0, delayed: 0 };
  const done = p.tasks.filter((t) => t.status === "done" || t.status === "completed" || t.status === "inspected" || t.status === "internal_approved").length;
  const doing = p.tasks.filter((t) => t.status === "in_progress").length;
  const delayed = p.tasks.filter((t) => t.status === "delayed").length;
  return { pct: Math.round((done / total) * 100), done, total, doing, delayed };
}

function fmtDate(s: string) {
  const d = new Date(s);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function phaseMarker(p: Phase): { icon: string; color: string } {
  if (p.status === "completed") return { icon: "✓", color: "#6FA677" };
  if (p.status === "in_progress") return { icon: "◐", color: "#E0B855" };
  return { icon: "○", color: "#5a4f42" };
}

export function ProjectHubClient({ project, phases, currentRole }: Props) {
  const sb = statusBadge(project.status);

  const totalTasks = phases.reduce((acc, p) => acc + p.tasks.length, 0);
  const doneTasks = phases.reduce(
    (acc, p) =>
      acc +
      p.tasks.filter((t) => t.status === "done" || t.status === "completed" || t.status === "inspected" || t.status === "internal_approved").length,
    0,
  );
  const overallPct = totalTasks === 0 ? 0 : Math.round((doneTasks / totalTasks) * 100);

  const inProgressTasks = phases.flatMap((p) =>
    p.tasks
      .filter((t) => t.status === "in_progress")
      .map((t) => ({ ...t, phaseCode: p.code, phaseName: p.name })),
  );
  const delayedTasks = phases.flatMap((p) =>
    p.tasks
      .filter((t) => t.status === "delayed")
      .map((t) => ({ ...t, phaseCode: p.code, phaseName: p.name })),
  );

  const canViewPayments = currentRole === "admin" || currentRole === "accountant";
  const canViewMembers = currentRole === "admin" || currentRole === "construction_manager";

  type Shortcut = {
    Icon: React.ComponentType<{ className?: string }>;
    label: string;
    href: string;
    color: string;
    bg: string;
  };

  const shortcuts: Shortcut[] = [
    { Icon: ListChecks, label: "Tiến độ", href: `/projects/${project.id}/tasks`, color: "#E0B855", bg: "rgba(224,184,85,0.12)" },
    { Icon: Briefcase, label: "Dự toán", href: `/projects/${project.id}/budget`, color: "#a78bfa", bg: "rgba(167,139,250,0.12)" },
    { Icon: ClipboardList, label: "Giao việc", href: `/projects/${project.id}/work-orders`, color: "#D27A52", bg: "rgba(210,122,82,0.12)" },
    { Icon: Sun, label: "Cuối ngày", href: `/projects/${project.id}/eod`, color: "#6FA677", bg: "rgba(111,166,119,0.12)" },
    { Icon: Package, label: "Đề xuất VT", href: `/projects/${project.id}/material-proposals`, color: "#a78bfa", bg: "rgba(167,139,250,0.12)" },
    { Icon: Wallet, label: "Lương tuần", href: `/projects/${project.id}/payroll`, color: "#E0B855", bg: "rgba(224,184,85,0.12)" },
    { Icon: Users, label: "Thầu phụ", href: `/projects/${project.id}/sub-contracts`, color: "#D27A52", bg: "rgba(210,122,82,0.12)" },
    { Icon: BookOpen, label: "Nhật ký", href: `/projects/${project.id}/construction-log`, color: "#9a8f80", bg: "rgba(154,143,128,0.12)" },
    { Icon: FileText, label: "Hồ sơ", href: `/projects/${project.id}/documents`, color: "#9a8f80", bg: "rgba(154,143,128,0.12)" },
    ...(canViewPayments
      ? [{ Icon: Banknote as Shortcut["Icon"], label: "Lịch TT", href: `/projects/${project.id}/payments`, color: "#E0B855", bg: "rgba(224,184,85,0.12)" }]
      : []),
    ...(canViewMembers
      ? [{ Icon: Users as Shortcut["Icon"], label: "Thành viên", href: `/projects/${project.id}/members`, color: "#9a8f80", bg: "rgba(154,143,128,0.12)" }]
      : []),
    { Icon: FolderOpen, label: "Tổng quan", href: `/projects/${project.id}`, color: "#9a8f80", bg: "rgba(154,143,128,0.12)" },
  ];

  return (
    <div className="space-y-4">
      <Link
        href="/ks-ql/today"
        className="inline-flex items-center gap-1.5 text-xs text-[#9a8f80] transition-colors hover:text-[#E0B855]"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        <span>Về App KS</span>
      </Link>

      <section
        className="overflow-hidden rounded-2xl border border-[#2a221c] p-4"
        style={{ background: "linear-gradient(135deg, #1f1812 0%, #181410 50%, #120e0b 100%)" }}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
            style={{ background: "rgba(210,122,82,0.15)", color: "#D27A52" }}
          >
            {project.code}
          </span>
          <span
            className="rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
            style={{ background: sb.bg, color: sb.color }}
          >
            {sb.label}
          </span>
        </div>
        <h1 className="mt-1.5 text-[20px] font-semibold leading-tight text-[#f5ede4]">
          {project.name}
        </h1>
        <div className="mt-2 grid grid-cols-1 gap-1.5 text-xs text-[#9a8f80] sm:grid-cols-2">
          <div className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">Chủ nhà: <span className="text-[#d4c8b8]">{project.customerName}</span></span>
          </div>
          <div className="flex items-center gap-1.5">
            <CalendarClock className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              {fmtDate(project.startDate)} → {fmtDate(project.plannedDeadline ?? project.expectedEndDate)}
            </span>
          </div>
          {project.address ? (
            <div className="flex items-start gap-1.5 sm:col-span-2">
              <FolderOpen className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span className="line-clamp-2">{project.address}</span>
            </div>
          ) : null}
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-[#2a221c] bg-[#181410] p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-[#9a8f80]">Hạng mục công tác</div>
            <div className="mt-0.5 text-[15px] font-semibold text-[#f5ede4]">
              {doneTasks}/{totalTasks} công tác đã xong
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div
              className="text-[26px] font-bold leading-none"
              style={{
                background: "linear-gradient(90deg, #E0B855 0%, #D27A52 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              {overallPct}%
            </div>
            <div className="mt-1 text-[10px] uppercase tracking-wider text-[#5a4f42]">Tổng</div>
          </div>
        </div>

        {phases.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[#2a221c] px-3 py-6 text-center text-xs text-[#9a8f80]">
            Chưa có giai đoạn nào. TPTC vào tab Tiến độ để thiết lập.
          </div>
        ) : (
          <div className="space-y-2">
            {phases.map((p) => {
              const prog = phaseProgress(p);
              const mark = phaseMarker(p);
              return (
                <Link
                  key={p.id}
                  href={`/projects/${project.id}/tasks#${p.code}`}
                  className="group block rounded-xl border border-[#2a221c] bg-[#0d0b09] p-3 transition-colors hover:border-[#E0B855]/40"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-bold"
                          style={{ background: `${mark.color}22`, color: mark.color }}
                        >
                          {mark.icon}
                        </span>
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-[#D27A52]">
                          {p.code}
                        </span>
                        <span className="truncate text-[13px] font-medium text-[#f5ede4]">{p.name}</span>
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#9a8f80]">
                        <span>
                          <span className="text-[#d4c8b8]">{prog.done}</span>/{prog.total} xong
                        </span>
                        {prog.doing > 0 ? (
                          <span className="inline-flex items-center gap-1" style={{ color: "#E0B855" }}>
                            <Loader className="h-3 w-3" />
                            {prog.doing} đang làm
                          </span>
                        ) : null}
                        {prog.delayed > 0 ? (
                          <span className="inline-flex items-center gap-1" style={{ color: "#D26B6B" }}>
                            {prog.delayed} trễ
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-sm font-semibold text-[#f5ede4]">{prog.pct}%</div>
                    </div>
                  </div>
                  {prog.total > 0 ? (
                    <div className="mt-2 h-1 overflow-hidden rounded-full bg-[#2a221c]">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${prog.pct}%`,
                          background:
                            p.status === "completed"
                              ? "#6FA677"
                              : "linear-gradient(90deg, #E0B855 0%, #D27A52 100%)",
                        }}
                      />
                    </div>
                  ) : null}
                </Link>
              );
            })}
          </div>
        )}

        {(inProgressTasks.length > 0 || delayedTasks.length > 0) && (
          <div className="mt-3 space-y-1.5 border-t border-[#2a221c] pt-3">
            {delayedTasks.slice(0, 3).map((t) => (
              <Link
                key={t.id}
                href={`/projects/${project.id}/tasks`}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[12px] transition-colors hover:bg-[#0d0b09]"
              >
                <span
                  className="rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider"
                  style={{ background: "rgba(210,107,107,0.18)", color: "#D26B6B" }}
                >
                  Trễ
                </span>
                <span className="text-[10px] text-[#5a4f42]">{t.code}</span>
                <span className="min-w-0 flex-1 truncate text-[#d4c8b8]">{t.name}</span>
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[#5a4f42]" />
              </Link>
            ))}
            {inProgressTasks.slice(0, 3).map((t) => (
              <Link
                key={t.id}
                href={`/projects/${project.id}/tasks`}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[12px] transition-colors hover:bg-[#0d0b09]"
              >
                <span
                  className="rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider"
                  style={{ background: "rgba(224,184,85,0.18)", color: "#E0B855" }}
                >
                  Đang
                </span>
                <span className="text-[10px] text-[#5a4f42]">{t.code}</span>
                <span className="min-w-0 flex-1 truncate text-[#d4c8b8]">{t.name}</span>
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[#5a4f42]" />
              </Link>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-2 text-[11px] uppercase tracking-wider text-[#9a8f80]">Mở tab</div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {shortcuts.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              className="group flex flex-col items-center justify-center gap-1.5 rounded-xl border border-[#2a221c] bg-[#181410] px-2 py-3 text-center transition-all hover:-translate-y-px hover:border-[#3a2d22] hover:bg-[#1f1812]"
            >
              <span
                className="grid h-9 w-9 place-items-center rounded-lg"
                style={{ background: s.bg, color: s.color }}
              >
                <s.Icon className="h-4 w-4" />
              </span>
              <span className="text-[11px] font-medium leading-tight text-[#d4c8b8]">{s.label}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
