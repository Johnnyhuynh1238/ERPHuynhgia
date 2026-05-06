import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCustomerPortalApiAccess } from "@/lib/customer-portal-v2";

export async function GET(_request: Request, { params }: { params: { token: string; taskId: string } }) {
  const access = await requireCustomerPortalApiAccess(params.token);
  if (!access.ok) return NextResponse.json({ message: access.message }, { status: access.status });

  const task = await prisma.task.findFirst({
    where: { id: params.taskId, projectId: access.project.id, isActive: true, visibleToCustomer: true },
    select: { id: true },
  });
  if (!task) return NextResponse.json({ message: "Task không hợp lệ" }, { status: 404 });

  const photos = await prisma.taskPhoto.findMany({
    where: { taskId: params.taskId },
    orderBy: { createdAt: "desc" },
    include: { user: { select: { fullName: true } } },
  });

  return NextResponse.json({ photos });
}
