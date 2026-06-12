import { notFound, redirect } from "next/navigation";
import { ProjectStatus } from "@prisma/client";
import { ProtectedLayout } from "@/components/protected-layout";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import {
  canApproveGrade,
  canManageWorkers,
  canProposeGrade,
  canViewWorkers,
} from "@/lib/worker-management";
import { WorkerDetailClient } from "./_components/worker-detail-client";

export default async function WorkerDetailPage({
  params,
}: {
  params: { workerId: string };
}) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) redirect("/login");
  if (!canViewWorkers(user.role)) redirect("/?denied=1");

  const worker = await prisma.worker.findUnique({
    where: { id: params.workerId },
    include: {
      project: { select: { id: true, name: true } },
      docs: { orderBy: { uploadedAt: "desc" } },
      gradeHistory: {
        orderBy: { createdAt: "desc" },
        include: {
          proposedBy: { select: { id: true, fullName: true } },
          approvedBy: { select: { id: true, fullName: true } },
        },
      },
    },
  });
  if (!worker) notFound();

  const [projects, rates] = await Promise.all([
    prisma.project.findMany({
      where: {
        status: {
          in: [ProjectStatus.in_progress, ProjectStatus.planning, ProjectStatus.paused],
        },
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.gradeRate.findMany({
      where: { isCurrent: true },
      orderBy: { grade: "asc" },
      select: { grade: true, dailyRate: true, note: true },
    }),
  ]);

  return (
    <ProtectedLayout>
      <WorkerDetailClient
        worker={JSON.parse(JSON.stringify(worker))}
        projects={projects}
        rates={rates}
        canManage={canManageWorkers(user.role)}
        canPropose={canProposeGrade(user.role)}
        canApprove={canApproveGrade(user.role)}
      />
    </ProtectedLayout>
  );
}
