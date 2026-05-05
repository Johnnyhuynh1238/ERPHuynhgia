import { NextResponse } from "next/server";
import { TaskActivityType, TaskCategory, TaskLogType, TaskStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCustomerPortalSessionByToken } from "@/lib/auth-helpers";
import { getClientIpFromHeaders } from "@/lib/customer-portal";
import { syncPhaseStatusByTaskId } from "@/lib/project-phase";

function parseRating(formData: FormData, name: string) {
  const value = Number(formData.get(name));
  return Number.isInteger(value) && value >= 1 && value <= 5 ? value : null;
}

export async function POST(request: Request, { params }: { params: { token: string; taskId: string } }) {
  const { project, session } = await getCustomerPortalSessionByToken(params.token);
  if (!project || !session) {
    return NextResponse.redirect(new URL(`/cn/${params.token}`, request.url));
  }

  const formData = await request.formData();
  const signatureUrl = String(formData.get("signatureUrl") || "").trim();
  const note = String(formData.get("note") || "").trim();
  const taskNote = String(formData.get("taskNote") || "").trim();
  const ksNote = String(formData.get("ksNote") || "").trim();
  const confirmed = String(formData.get("confirmed") || "") === "on";
  const taskRating = parseRating(formData, "taskRating");
  const ksRatingExpertise = parseRating(formData, "ksRatingExpertise");
  const ksRatingAttitude = parseRating(formData, "ksRatingAttitude");
  const ksRatingCommunication = parseRating(formData, "ksRatingCommunication");

  if (!signatureUrl) {
    return NextResponse.json({ message: "Thiếu chữ ký" }, { status: 400 });
  }

  if (!confirmed) {
    return NextResponse.json({ message: "Bạn chưa xác nhận đồng ý nghiệm thu" }, { status: 400 });
  }

  if (!taskRating || !ksRatingExpertise || !ksRatingAttitude || !ksRatingCommunication) {
    return NextResponse.json({ message: "Vui lòng đánh giá đủ task và 3 tiêu chí kỹ sư" }, { status: 400 });
  }

  const task = await prisma.task.findFirst({
    where: {
      id: params.taskId,
      projectId: project.id,
      isActive: true,
      visibleToCustomer: true,
      isMilestone: true,
      category: TaskCategory.major_milestone,
      status: TaskStatus.internal_approved,
    },
    select: {
      id: true,
      code: true,
      name: true,
      assignedEngineerId: true,
      customerAcknowledgments: { select: { id: true }, take: 1 },
      customerTaskRating: { select: { id: true } },
      customerKsRating: { select: { id: true } },
    },
  });

  if (!task || !task.assignedEngineerId) {
    return NextResponse.json({ message: "Task không hợp lệ để nghiệm thu" }, { status: 400 });
  }

  if (task.customerAcknowledgments.length > 0 || task.customerTaskRating || task.customerKsRating) {
    return NextResponse.json({ message: "Task này đã được nghiệm thu hoặc đánh giá trước đó" }, { status: 400 });
  }

  const ipAddress = getClientIpFromHeaders(request.headers);
  const userAgent = request.headers.get("user-agent") || "";
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.customerTaskRating.create({
      data: {
        taskId: task.id,
        ksUserId: task.assignedEngineerId!,
        projectId: project.id,
        rating: taskRating,
        note: taskNote || null,
        ratedAt: now,
      },
    });

    await tx.customerKsRating.create({
      data: {
        taskId: task.id,
        ksUserId: task.assignedEngineerId!,
        projectId: project.id,
        ratingExpertise: ksRatingExpertise,
        ratingAttitude: ksRatingAttitude,
        ratingCommunication: ksRatingCommunication,
        note: ksNote || null,
        ratedAt: now,
      },
    });

    await tx.customerAcknowledgment.create({
      data: {
        projectId: project.id,
        taskId: task.id,
        signatureUrl,
        ipAddress,
        userAgent,
        acknowledgedAt: now,
        note: note || null,
      },
    });

    await tx.task.update({
      where: { id: task.id },
      data: {
        status: TaskStatus.completed,
        customerSignedAt: now,
        customerSignatureUrl: signatureUrl,
      },
    });

    await tx.taskActivityLog.create({
      data: {
        taskId: task.id,
        userId: task.assignedEngineerId!,
        type: TaskActivityType.customer_signed,
        fromValue: TaskStatus.internal_approved,
        toValue: TaskStatus.completed,
        metadata: {
          source: "customer_portal",
          taskRating,
          ksRatingExpertise,
          ksRatingAttitude,
          ksRatingCommunication,
        },
        description: `Chủ nhà nghiệm thu và đánh giá task: ${task.code} - ${task.name}`,
        createdAt: now,
      },
    });

    await tx.taskLog.create({
      data: {
        taskId: task.id,
        userId: task.assignedEngineerId!,
        logType: TaskLogType.status_change,
        oldValue: TaskStatus.internal_approved,
        newValue: TaskStatus.completed,
        content: "CUSTOMER_ACKNOWLEDGED_WITH_RATING",
        createdAt: now,
      },
    });

    await syncPhaseStatusByTaskId(tx, task.id, now);
  });

  return NextResponse.redirect(new URL(`/cn/${params.token}/tasks/${params.taskId}`, request.url));
}
