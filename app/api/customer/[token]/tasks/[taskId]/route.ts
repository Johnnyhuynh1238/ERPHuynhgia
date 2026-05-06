import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCustomerPortalApiAccess } from "@/lib/customer-portal-v2";

export async function GET(_request: Request, { params }: { params: { token: string; taskId: string } }) {
  const access = await requireCustomerPortalApiAccess(params.token);
  if (!access.ok) return NextResponse.json({ message: access.message }, { status: access.status });

  const task = await prisma.task.findFirst({
    where: { id: params.taskId, projectId: access.project.id, isActive: true, visibleToCustomer: true },
    include: {
      projectPhase: { select: { id: true, code: true, name: true } },
      assignedEngineer: { select: { id: true, fullName: true, phone: true, avatarUrl: true } },
      taskPhotos: { orderBy: { createdAt: "desc" }, take: 60 },
      qcItems: {
        orderBy: { orderIndex: "asc" },
        include: {
          progress: { include: { updater: { select: { fullName: true } } } },
          photos: { orderBy: { uploadedAt: "desc" } },
        },
      },
      customerComments: {
        where: { OR: [{ targetType: "task", targetId: params.taskId }, { targetType: null }] },
        orderBy: { createdAt: "desc" },
        include: {
          threadReplies: { orderBy: { createdAt: "asc" } },
          replies: { include: { author: { select: { fullName: true } } }, orderBy: { createdAt: "asc" } },
        },
      },
      customerAcknowledgments: true,
      customerTaskRating: true,
      customerKsRating: true,
    },
  });

  if (!task) return NextResponse.json({ message: "Task không hợp lệ" }, { status: 404 });
  return NextResponse.json({ task });
}
