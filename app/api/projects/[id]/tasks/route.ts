import { NextResponse } from "next/server";
import { TaskPhase, TaskStatus, UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { buildProjectAccessWhere } from "@/lib/project-permissions";

function mapPhase(value: string | null): TaskPhase | null {
  if (!value || value === "all") return null;
  if (Object.values(TaskPhase).includes(value as TaskPhase)) return value as TaskPhase;
  return null;
}

function mapStatus(value: string | null): TaskStatus | null {
  if (!value || value === "all") return null;
  if (Object.values(TaskStatus).includes(value as TaskStatus)) return value as TaskStatus;
  return null;
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }

  const project = await prisma.project.findFirst({
    where: {
      id: params.id,
      ...buildProjectAccessWhere({ id: user.id, role: user.role }),
    },
    select: {
      id: true,
      projectManagerId: true,
      mainEngineerId: true,
      code: true,
      name: true,
    },
  });

  if (!project) {
    return NextResponse.json({ message: "Không có quyền hoặc dự án không tồn tại" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const phase = mapPhase(searchParams.get("phase"));
  const status = mapStatus(searchParams.get("status"));
  const engineerId = searchParams.get("engineerId") || "";
  const search = (searchParams.get("search") || "").trim();

  const isAdminLike = user.role === UserRole.admin || user.role === UserRole.accountant;
  const isProjectOwner = user.id === project.projectManagerId || user.id === project.mainEngineerId;

  let roleFilter: Record<string, any> = {};
  if (!isAdminLike && !isProjectOwner) {
    if (user.role === UserRole.foreman) {
      roleFilter = { assignedForemanId: user.id };
    } else {
      roleFilter = { assignedEngineerId: user.id };
    }
  }

  const tasks = await prisma.task.findMany({
    where: {
      projectId: params.id,
      ...(phase ? { phase } : {}),
      ...(status ? { status } : {}),
      ...(engineerId ? { assignedEngineerId: engineerId } : {}),
      ...(search ? { name: { contains: search, mode: "insensitive" } } : {}),
      ...roleFilter,
    },
    include: {
      assignedEngineer: {
        select: { id: true, fullName: true },
      },
      assignedForeman: {
        select: { id: true, fullName: true },
      },
      template: {
        select: {
          proposerRole: true,
          ordererRole: true,
          receiverRole: true,
        },
      },
    },
    orderBy: [{ offsetDays: "asc" }, { code: "asc" }],
  });

  const engineers = await prisma.user.findMany({
    where: { role: UserRole.engineer, isActive: true },
    select: { id: true, fullName: true },
    orderBy: { fullName: "asc" },
  });

  return NextResponse.json({
    project,
    tasks,
    engineers,
    role: user.role,
  });
}
