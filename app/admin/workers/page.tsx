import { redirect } from "next/navigation";
import { ProjectStatus } from "@prisma/client";
import { ProtectedLayout } from "@/components/protected-layout";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { canViewWorkers, canManageWorkers } from "@/lib/worker-management";
import { WorkersClient } from "./_components/workers-client";

export default async function AdminWorkersPage() {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    redirect("/login");
  }
  if (!canViewWorkers(user.role)) {
    redirect("/?denied=1");
  }

  const projects = await prisma.project.findMany({
    where: {
      status: { in: [ProjectStatus.in_progress, ProjectStatus.planning, ProjectStatus.paused] },
    },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const rates = await prisma.gradeRate.findMany({
    where: { isCurrent: true },
    orderBy: { grade: "asc" },
    select: { grade: true, dailyRate: true, note: true },
  });

  return (
    <ProtectedLayout>
      <WorkersClient
        projects={projects}
        rates={rates}
        canManage={canManageWorkers(user.role)}
        userRole={user.role}
      />
    </ProtectedLayout>
  );
}
