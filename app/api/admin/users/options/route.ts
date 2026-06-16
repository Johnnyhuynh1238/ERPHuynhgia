import { NextResponse } from "next/server";
import { ProjectStatus, UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-helpers";

function mapAuthError(error: unknown) {
  const message = error instanceof Error ? error.message : "UNKNOWN";
  if (message === "401_UNAUTHORIZED") {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }
  if (message === "403_FORBIDDEN") {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }
  return null;
}

export async function GET() {
  try {
    await requireRole(["admin", "construction_manager"]);
  } catch (error) {
    return mapAuthError(error) || NextResponse.json({ message: "Lỗi xác thực" }, { status: 500 });
  }

  const [users, projects] = await Promise.all([
    prisma.user.findMany({
      where: { isActive: true },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
      },
      orderBy: { fullName: "asc" },
    }),
    prisma.project.findMany({
      where: { status: { in: [ProjectStatus.planning, ProjectStatus.in_progress] } },
      select: { id: true, code: true, name: true },
      orderBy: { code: "asc" },
    }),
  ]);

  return NextResponse.json({
    admins: users.filter((u) => u.role === UserRole.admin || u.role === UserRole.construction_manager),
    engineers: users.filter((u) => u.role === UserRole.engineer),
    members: users,
    projects: projects.map((p) => ({ ...p, isActive: true })),
  });
}
