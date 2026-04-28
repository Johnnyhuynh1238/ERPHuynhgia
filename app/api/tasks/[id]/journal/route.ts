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

  const entries = await prisma.eveningReportTask.findMany({
    where: { taskId: params.id },
    orderBy: { eveningReport: { reportDate: "desc" } },
    include: {
      taskPhotos: { orderBy: { createdAt: "desc" }, include: { user: { select: { id: true, fullName: true, email: true } } } },
      eveningReport: {
        include: {
          reporter: { select: { id: true, fullName: true, email: true } },
          sitePhotos: { orderBy: { uploadedAt: "desc" } },
        },
      },
    },
  });

  const reportIds = entries.map((e) => e.eveningReport.id);
  const qcLogs = reportIds.length
    ? await prisma.taskQcLog.findMany({
        where: {
          taskId: params.id,
          eveningReportId: { in: reportIds },
        },
        include: {
          qcItem: { select: { id: true, content: true } },
          checker: { select: { id: true, fullName: true, email: true } },
        },
        orderBy: { checkedAt: "asc" },
      })
    : [];

  const qcLogsByReportId = qcLogs.reduce<Record<string, typeof qcLogs>>((acc, log) => {
    const key = log.eveningReportId || "";
    if (!key) return acc;
    if (!acc[key]) acc[key] = [];
    acc[key].push(log);
    return acc;
  }, {});

  return NextResponse.json({
    entries: entries.map((entry) => ({
      ...entry,
      qcLogs: qcLogsByReportId[entry.eveningReport.id] || [],
    })),
  });
}
