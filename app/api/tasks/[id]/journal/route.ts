import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { getTaskWithAccess } from "@/lib/task-permissions";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });

  const { task, allowed } = await getTaskWithAccess(params.id, { id: user.id, role: user.role });
  if (!task) return NextResponse.json({ message: "Không tìm thấy task" }, { status: 404 });
  if (!allowed) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const [technical, material, labor, equipment] = await Promise.all([
    prisma.taskTechnicalReport.findMany({ where: { taskId: params.id }, include: { creator: { select: { id: true, fullName: true, email: true } } }, orderBy: { reportDate: "desc" } }),
    prisma.taskMaterialReport.findMany({ where: { taskId: params.id }, include: { creator: { select: { id: true, fullName: true, email: true } } }, orderBy: { reportDate: "desc" } }),
    prisma.taskLaborReport.findMany({ where: { taskId: params.id }, include: { creator: { select: { id: true, fullName: true, email: true } } }, orderBy: { reportDate: "desc" } }),
    prisma.taskEquipmentReport.findMany({ where: { taskId: params.id }, include: { creator: { select: { id: true, fullName: true, email: true } } }, orderBy: { reportDate: "desc" } }),
  ]);

  const entries = [
    ...technical.map((r) => ({ id: r.id, reportDate: r.reportDate, reportType: "technical", createdAt: r.createdAt, reporter: r.creator, payload: r })),
    ...material.map((r) => ({ id: r.id, reportDate: r.reportDate, reportType: "material", createdAt: r.createdAt, reporter: r.creator, payload: r })),
    ...labor.map((r) => ({ id: r.id, reportDate: r.reportDate, reportType: "labor", createdAt: r.createdAt, reporter: r.creator, payload: r })),
    ...equipment.map((r) => ({ id: r.id, reportDate: r.reportDate, reportType: "equipment", createdAt: r.createdAt, reporter: r.creator, payload: r })),
  ].sort((a, b) => +new Date(b.reportDate) - +new Date(a.reportDate));

  return NextResponse.json({ entries });
}
