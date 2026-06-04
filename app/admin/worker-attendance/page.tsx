import { redirect } from "next/navigation";
import { ProjectStatus, UserRole } from "@prisma/client";
import { ProtectedLayout } from "@/components/protected-layout";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { canViewAdminWorkerAttendance } from "@/lib/worker-attendance-summary";
import { WorkerAttendanceAdminClient } from "./_components/worker-attendance-client";

export default async function AdminWorkerAttendancePage() {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    redirect("/login");
  }
  if (!canViewAdminWorkerAttendance(user.role)) {
    redirect("/?denied=1");
  }

  const projects = await prisma.project.findMany({
    where: {
      status: { in: [ProjectStatus.in_progress, ProjectStatus.planning, ProjectStatus.paused] },
    },
    select: { id: true, name: true, status: true },
    orderBy: [{ status: "asc" }, { name: "asc" }],
  });

  const canEditWage = user.role === UserRole.admin || user.role === UserRole.accountant;

  return (
    <ProtectedLayout>
      <WorkerAttendanceAdminClient
        projects={projects.map((p) => ({ id: p.id, name: p.name, status: p.status }))}
        canEditWage={canEditWage}
      />
    </ProtectedLayout>
  );
}
