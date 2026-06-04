import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import {
  canViewAdminWorkerAttendance,
  getWorkerAttendanceForWeek,
  mondayOfWeekUtc,
  parseDateOnly,
} from "@/lib/worker-attendance-summary";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user?.id || !canViewAdminWorkerAttendance(user.role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const url = new URL(request.url);
  const projectId = url.searchParams.get("projectId");
  if (!projectId) {
    return NextResponse.json({ message: "Thiếu projectId" }, { status: 400 });
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true },
  });
  if (!project) {
    return NextResponse.json({ message: "Dự án không tồn tại" }, { status: 404 });
  }

  const dateParam = parseDateOnly(url.searchParams.get("date"));
  const monday = mondayOfWeekUtc(dateParam ?? new Date());

  const data = await getWorkerAttendanceForWeek({ projectId, monday });

  return NextResponse.json({
    project: { id: project.id, name: project.name },
    ...data,
  });
}
