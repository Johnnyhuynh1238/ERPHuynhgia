import { NextResponse } from "next/server";
import { ProjectMemberRole, UserRole } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, requireRole } from "@/lib/auth-helpers";
import { buildProjectAccessWhere } from "@/lib/project-permissions";

const createSchema = z.object({
  userId: z.string().uuid(),
  roleInProject: z.nativeEnum(ProjectMemberRole),
});

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }

  const accessWhere = buildProjectAccessWhere({ id: user.id, role: user.role });

  const project = await prisma.project.findFirst({
    where: {
      id: params.id,
      ...accessWhere,
    },
    select: { id: true },
  });

  if (!project) {
    return NextResponse.json({ message: "Không có quyền hoặc dự án không tồn tại" }, { status: 403 });
  }

  const members = await prisma.projectMember.findMany({
    where: { projectId: params.id },
    include: {
      user: {
        select: {
          id: true,
          fullName: true,
          email: true,
        },
      },
      addedByUser: {
        select: {
          id: true,
          fullName: true,
          email: true,
        },
      },
    },
    orderBy: { addedAt: "desc" },
  });

  return NextResponse.json({ members });
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  let current;
  try {
    current = await requireRole([UserRole.admin]);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "UNKNOWN";
    if (msg === "401_UNAUTHORIZED") return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
    if (msg === "403_FORBIDDEN") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
    return NextResponse.json({ message: "Lỗi xác thực" }, { status: 500 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      projectManagerId: true,
      mainEngineerId: true,
    },
  });

  if (!project) {
    return NextResponse.json({ message: "Không tìm thấy dự án" }, { status: 404 });
  }

  if (parsed.data.userId === project.projectManagerId || parsed.data.userId === project.mainEngineerId) {
    return NextResponse.json({ message: "User này đã có quyền qua vai trò chính, không cần thêm member" }, { status: 400 });
  }

  const existed = await prisma.projectMember.findFirst({
    where: {
      projectId: params.id,
      userId: parsed.data.userId,
    },
    select: { id: true },
  });

  if (existed) {
    return NextResponse.json({ message: "User đã là thành viên dự án" }, { status: 400 });
  }

  const member = await prisma.projectMember.create({
    data: {
      projectId: params.id,
      userId: parsed.data.userId,
      roleInProject: parsed.data.roleInProject,
      addedBy: current.id,
    },
    include: {
      user: { select: { id: true, fullName: true, email: true } },
      addedByUser: { select: { id: true, fullName: true, email: true } },
    },
  });

  return NextResponse.json({ member, message: "Đã thêm thành viên" });
}
