import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getTaskWithAccess } from "@/lib/task-permissions";
import { TaskDetailClient } from "./_components/task-detail-client";

export default async function TaskDetailPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    redirect("/login");
  }

  const { task, allowed } = await getTaskWithAccess(params.id, { id: user.id, role: user.role });

  if (!task) {
    notFound();
  }

  if (!allowed) {
    redirect("/projects?denied=task");
  }

  const [detail, logs, photos, engineers, foremen] = await Promise.all([
    prisma.task.findUnique({
      where: { id: params.id },
      include: {
        project: {
          select: {
            id: true,
            code: true,
            name: true,
            projectManagerId: true,
            mainEngineerId: true,
          },
        },
        template: {
          select: {
            proposerRole: true,
            ordererRole: true,
            receiverRole: true,
          },
        },
        assignedEngineer: { select: { id: true, fullName: true, email: true } },
        assignedForeman: { select: { id: true, fullName: true, email: true } },
      },
    }),
    prisma.taskLog.findMany({
      where: { taskId: params.id },
      include: {
        user: { select: { id: true, fullName: true, email: true, avatarUrl: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.taskPhoto.findMany({
      where: { taskId: params.id },
      include: {
        user: { select: { id: true, fullName: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.user.findMany({
      where: { role: "engineer", isActive: true },
      select: { id: true, fullName: true, email: true },
      orderBy: { fullName: "asc" },
    }),
    prisma.user.findMany({
      where: { role: "foreman", isActive: true },
      select: { id: true, fullName: true, email: true },
      orderBy: { fullName: "asc" },
    }),
  ]);

  if (!detail) notFound();

  const canManageQcItem =
    user.role === "admin" ||
    user.role === "construction_manager" ||
    (user.role === "engineer" &&
      Boolean(
        await prisma.projectMember.findFirst({
          where: {
            projectId: detail.project.id,
            userId: user.id,
            roleInProject: "engineer",
          },
          select: { id: true },
        }),
      ));

  return (
    <TaskDetailClient
      initialTask={JSON.parse(JSON.stringify(detail))}
      initialLogs={JSON.parse(JSON.stringify(logs))}
      initialPhotos={JSON.parse(JSON.stringify(photos))}
      engineers={engineers}
      foremen={foremen}
      currentUserId={user.id}
      currentUserRole={user.role}
      canManageQcItem={canManageQcItem}
    />
  );
}
