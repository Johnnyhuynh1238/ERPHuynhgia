import Link from "next/link";
import { notFound } from "next/navigation";
import { TaskStatus } from "@prisma/client";
import { getCustomerPortalSessionByToken } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

const completedStatuses: TaskStatus[] = [TaskStatus.done, TaskStatus.inspected, TaskStatus.internal_approved, TaskStatus.completed];

function dateText(value: Date | null | undefined) {
  return value ? value.toLocaleDateString("vi-VN") : "Chưa cập nhật";
}

function statusText(status: TaskStatus) {
  if (completedStatuses.includes(status)) return "Hoàn tất";
  if (status === TaskStatus.in_progress) return "Đang thi công";
  if (status === TaskStatus.delayed) return "Chậm tiến độ";
  return "Chưa bắt đầu";
}

function statusTone(status: TaskStatus) {
  if (completedStatuses.includes(status)) return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
  if (status === TaskStatus.in_progress) return "border-orange-500/30 bg-orange-500/10 text-orange-200";
  if (status === TaskStatus.delayed) return "border-red-500/30 bg-red-500/10 text-red-200";
  return "border-[#2d3249] bg-[#13151f] text-[#a8b0c8]";
}

export default async function CustomerTimelinePage({
  params,
  searchParams,
}: {
  params: { token: string };
  searchParams?: { filter?: string };
}) {
  const { project, session } = await getCustomerPortalSessionByToken(params.token);
  if (!project || !session) notFound();

  const todayOnly = searchParams?.filter === "today";
  const taskWhere = {
    isActive: true,
    visibleToCustomer: true,
    ...(todayOnly ? { status: TaskStatus.in_progress } : {}),
  };

  const phases = await prisma.projectPhase.findMany({
    where: { projectId: project.id },
    orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
    include: {
      tasks: {
        where: taskWhere,
        orderBy: [{ displayOrder: { sort: "asc", nulls: "last" } }, { code: "asc" }],
        select: {
          id: true,
          code: true,
          name: true,
          status: true,
          progressPercent: true,
          plannedStartDate: true,
          plannedEndDate: true,
          actualStartDate: true,
          actualEndDate: true,
        },
      },
    },
  });

  const visiblePhases = todayOnly ? phases.filter((p) => p.tasks.length > 0) : phases;

  return (
    <div className="owner-portal-page">
      <section className="owner-section">
        <div className="owner-section-title">TIẾN ĐỘ THI CÔNG</div>
        <div className="text-sm owner-muted">Theo dõi từng giai đoạn và các công việc đang mở cho chủ nhà.</div>
      </section>

      {todayOnly ? (
        <section className="owner-section flex items-center justify-between gap-3 border border-orange-500/30 bg-orange-500/10">
          <div className="text-sm text-orange-200">
            <span className="font-semibold">Đang lọc:</span> Nhiệm vụ đang thi công
          </div>
          <Link href={`/cn/${params.token}/timeline`} className="text-xs font-medium text-orange-300 underline">
            Xoá lọc
          </Link>
        </section>
      ) : null}

      {visiblePhases.length === 0 ? (
        <section className="owner-section text-sm owner-muted">
          {todayOnly ? "Hiện chưa có nhiệm vụ nào đang thi công." : "Dự án chưa có giai đoạn hiển thị cho chủ nhà."}
        </section>
      ) : null}

      {visiblePhases.map((phase, index) => {
        const done = phase.tasks.filter((task) => completedStatuses.includes(task.status)).length;
        const total = phase.tasks.length;
        const percent = total ? Math.round((done / total) * 100) : 0;
        const active = percent > 0 && percent < 100;
        const completed = total > 0 && percent === 100;

        return (
          <section key={phase.id} className="owner-section">
            <div className="flex items-start gap-3">
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${completed ? "bg-emerald-500 text-black" : active ? "bg-[#ff8a3d] text-black" : "bg-[#2a2a2a] text-neutral-400"}`}>
                {index + 1}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-semibold text-white">{phase.name}</h2>
                    <div className="text-xs owner-muted">{phase.code} · {dateText(phase.plannedStartDate)} - {dateText(phase.plannedEndDate)}</div>
                  </div>
                  <div className="text-right text-xs owner-muted">{done}/{total}<br />{percent}%</div>
                </div>
                <div className="mt-3 owner-progress-track">
                  <div className={completed ? "h-full rounded-full bg-emerald-500" : "owner-progress-fill"} style={{ width: `${percent}%` }} />
                </div>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              {phase.tasks.length === 0 ? <div className="owner-card text-sm owner-muted">Chưa có task hiển thị.</div> : null}
              {phase.tasks.map((task) => (
                <Link key={task.id} href={`/cn/${params.token}/tasks/${task.id}?from=timeline`} className="owner-card block">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs owner-muted">{task.code}</div>
                      <div className="font-semibold text-white">{task.name}</div>
                      <div className="mt-1 text-xs owner-muted">Dự kiến: {dateText(task.plannedStartDate)} - {dateText(task.plannedEndDate)}</div>
                    </div>
                    <span className={`shrink-0 rounded-full border px-2 py-1 text-[11px] ${statusTone(task.status)}`}>{statusText(task.status)}</span>
                  </div>
                  <div className="mt-3 owner-progress-track h-1.5">
                    <div className="owner-progress-fill" style={{ width: `${task.progressPercent || 0}%` }} />
                  </div>
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
