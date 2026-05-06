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

export default async function CustomerTimelinePage({ params }: { params: { token: string } }) {
  const { project, session } = await getCustomerPortalSessionByToken(params.token);
  if (!project || !session) notFound();

  const phases = await prisma.projectPhase.findMany({
    where: { projectId: project.id },
    orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
    include: {
      tasks: {
        where: { isActive: true, visibleToCustomer: true },
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

  return (
    <div className="space-y-4 pb-2">
      <section className="rounded-3xl border border-[#252840] bg-[#1a1d2e] p-4">
        <div className="text-xs text-[#8892b0]">Theo dõi từng giai đoạn</div>
        <h1 className="mt-1 text-xl font-bold text-[#f8fafc]">Tiến độ thi công</h1>
      </section>

      {phases.length === 0 ? (
        <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4 text-sm text-[#8892b0]">
          Dự án chưa có giai đoạn hiển thị cho chủ nhà.
        </div>
      ) : null}

      {phases.map((phase, index) => {
        const done = phase.tasks.filter((task) => completedStatuses.includes(task.status)).length;
        const total = phase.tasks.length;
        const percent = total ? Math.round((done / total) * 100) : 0;
        const active = percent > 0 && percent < 100;
        const completed = total > 0 && percent === 100;

        return (
          <section key={phase.id} className={`rounded-3xl border p-4 ${active ? "border-orange-500/40 bg-orange-500/10" : "border-[#252840] bg-[#1a1d2e]"}`}>
            <div className="flex items-start gap-3">
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${completed ? "bg-emerald-500 text-white" : active ? "bg-[#f97316] text-white" : "bg-[#252840] text-[#8892b0]"}`}>
                {index + 1}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-semibold text-[#f8fafc]">{phase.name}</h2>
                    <div className="text-xs text-[#8892b0]">{phase.code} · {dateText(phase.plannedStartDate)} - {dateText(phase.plannedEndDate)}</div>
                  </div>
                  <div className="text-right text-xs text-[#a8b0c8]">{done}/{total}<br />{percent}%</div>
                </div>
                <div className="mt-3 h-2 rounded-full bg-[#252840]">
                  <div className={`h-2 rounded-full ${completed ? "bg-emerald-500" : "bg-[#f97316]"}`} style={{ width: `${percent}%` }} />
                </div>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              {phase.tasks.length === 0 ? <div className="rounded-xl bg-[#13151f] p-3 text-sm text-[#8892b0]">Chưa có task hiển thị.</div> : null}
              {phase.tasks.map((task) => (
                <Link key={task.id} href={`/cn/${params.token}/tasks/${task.id}`} className="block rounded-2xl border border-[#2d3249] bg-[#13151f] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs text-[#8892b0]">{task.code}</div>
                      <div className="font-semibold text-[#f8fafc]">{task.name}</div>
                      <div className="mt-1 text-xs text-[#8892b0]">Dự kiến: {dateText(task.plannedStartDate)} - {dateText(task.plannedEndDate)}</div>
                    </div>
                    <span className={`shrink-0 rounded-full border px-2 py-1 text-[11px] ${statusTone(task.status)}`}>{statusText(task.status)}</span>
                  </div>
                  <div className="mt-3 h-1.5 rounded-full bg-[#252840]">
                    <div className="h-1.5 rounded-full bg-[#fb923c]" style={{ width: `${task.progressPercent || 0}%` }} />
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
