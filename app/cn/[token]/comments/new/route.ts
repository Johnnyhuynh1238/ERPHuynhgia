import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCustomerPortalSessionByToken } from "@/lib/auth-helpers";
import { getClientIpFromHeaders } from "@/lib/customer-portal";

export async function POST(request: Request, { params }: { params: { token: string } }) {
  const { project, session } = await getCustomerPortalSessionByToken(params.token);
  if (!project || !session) {
    return NextResponse.redirect(new URL(`/cn/${params.token}`, request.url));
  }

  const formData = await request.formData();
  const taskIdRaw = String(formData.get("taskId") || "").trim();
  const eveningReportIdRaw = String(formData.get("eveningReportId") || "").trim();
  const content = String(formData.get("content") || "").trim();

  if (!content) {
    return NextResponse.redirect(new URL(request.headers.get("referer") || `/cn/${params.token}/dashboard`, request.url));
  }

  const taskId = taskIdRaw || null;
  const eveningReportId = eveningReportIdRaw || null;

  if (taskId) {
    const task = await prisma.task.findFirst({
      where: { id: taskId, projectId: project.id, isActive: true, visibleToCustomer: true },
      select: { id: true },
    });
    if (!task) return NextResponse.json({ message: "Task không hợp lệ" }, { status: 400 });
  }

  if (eveningReportId) {
    const report = await prisma.eveningReport.findFirst({
      where: { id: eveningReportId, projectId: project.id },
      select: { id: true },
    });
    if (!report) return NextResponse.json({ message: "Nhật ký không hợp lệ" }, { status: 400 });
  }

  const ipAddress = getClientIpFromHeaders(request.headers);
  const userAgent = request.headers.get("user-agent") || "";

  await prisma.customerComment.create({
    data: {
      projectId: project.id,
      taskId,
      eveningReportId,
      content,
      ipAddress,
      userAgent,
      readByStaff: false,
    },
  });

  return NextResponse.redirect(new URL(request.headers.get("referer") || `/cn/${params.token}/dashboard`, request.url));
}
