import { NextResponse } from "next/server";
import { TaskStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCustomerPortalSessionByToken } from "@/lib/auth-helpers";
import { getClientIpFromHeaders } from "@/lib/customer-portal";

export async function POST(request: Request, { params }: { params: { token: string; taskId: string } }) {
  const { project, session } = await getCustomerPortalSessionByToken(params.token);
  if (!project || !session) {
    return NextResponse.redirect(new URL(`/cn/${params.token}`, request.url));
  }

  const formData = await request.formData();
  const signatureUrl = String(formData.get("signatureUrl") || "").trim();
  const note = String(formData.get("note") || "").trim();
  const confirmed = String(formData.get("confirmed") || "") === "on";

  if (!signatureUrl) {
    return NextResponse.json({ message: "Thiếu chữ ký" }, { status: 400 });
  }

  if (!confirmed) {
    return NextResponse.json({ message: "Bạn chưa xác nhận đồng ý nghiệm thu" }, { status: 400 });
  }

  const task = await prisma.task.findFirst({
    where: {
      id: params.taskId,
      projectId: project.id,
      isActive: true,
      visibleToCustomer: true,
      isMilestone: true,
      status: { in: [TaskStatus.done, TaskStatus.inspected] },
    },
    select: { id: true },
  });

  if (!task) {
    return NextResponse.json({ message: "Task không hợp lệ để nghiệm thu" }, { status: 400 });
  }

  const existed = await prisma.customerAcknowledgment.findUnique({ where: { taskId: task.id }, select: { id: true } });
  if (existed) {
    return NextResponse.json({ message: "Task này đã được nghiệm thu trước đó" }, { status: 400 });
  }

  const ipAddress = getClientIpFromHeaders(request.headers);
  const userAgent = request.headers.get("user-agent") || "";

  await prisma.customerAcknowledgment.create({
    data: {
      projectId: project.id,
      taskId: task.id,
      signatureUrl,
      ipAddress,
      userAgent,
      note: note || null,
    },
  });

  return NextResponse.redirect(new URL(`/cn/${params.token}/tasks/${params.taskId}`, request.url));
}
