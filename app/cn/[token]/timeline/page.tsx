import Link from "next/link";
import { notFound } from "next/navigation";
import { TaskStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCustomerPortalSessionByToken } from "@/lib/auth-helpers";
import { PHASE_LABEL } from "@/lib/task-display";

const STATUS_ICON: Record<string, string> = {
  done: "✅",
  inspected: "✅",
  in_progress: "🔨",
  not_started: "⏳",
  delayed: "⚠",
  na: "⏸",
};

export default async function CustomerTimelinePage({ params }: { params: { token: string } }) {
  const { project, session } = await getCustomerPortalSessionByToken(params.token);
  if (!project || !session) notFound();

  const tasks = await prisma.task.findMany({
    where: { projectId: project.id, isActive: true, visibleToCustomer: true },
    select: { id: true, code: true, name: true, phase: true, status: true },
    orderBy: [{ displayOrder: { sort: "asc", nulls: "last" } }, { code: "asc" }],
  });

  const groups = new Map<string, typeof tasks>();
  tasks.forEach((task) => {
    const list = groups.get(task.phase) || [];
    list.push(task);
    groups.set(task.phase, list);
  });

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
        <h1 className="text-lg font-semibold">Tiến độ thi công</h1>
      </div>

      {Array.from(groups.entries()).map(([phase, phaseTasks]) => {
        const done = phaseTasks.filter((t) => t.status === TaskStatus.done || t.status === TaskStatus.inspected).length;
        const total = phaseTasks.length;
        const percent = total > 0 ? Math.round((done / total) * 100) : 0;

        return (
          <div key={phase} className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
            <div className="flex items-center justify-between">
              <div className="font-semibold">{PHASE_LABEL[phase as keyof typeof PHASE_LABEL] || phase}</div>
              <div className="text-xs text-[#8892b0]">{done}/{total} · {percent}%</div>
            </div>
            <div className="mt-2 space-y-2">
              {phaseTasks.map((task) => (
                <Link key={task.id} href={`/cn/${params.token}/tasks/${task.id}`} className="flex items-center gap-2 rounded-lg border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm">
                  <span>{STATUS_ICON[task.status] || "⏳"}</span>
                  <span className="font-medium">{task.code}</span>
                  <span>{task.name}</span>
                </Link>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
