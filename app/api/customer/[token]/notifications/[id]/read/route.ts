import { NextResponse } from "next/server";
import { requireCustomerPortalApiAccess } from "@/lib/customer-portal-v2";
import { prisma } from "@/lib/prisma";

export async function POST(_request: Request, { params }: { params: { token: string; id: string } }) {
  const access = await requireCustomerPortalApiAccess(params.token);
  if (!access.ok) return NextResponse.json({ message: access.message }, { status: access.status });

  await prisma.customerNotification.updateMany({
    where: { id: params.id, projectId: access.project.id, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
