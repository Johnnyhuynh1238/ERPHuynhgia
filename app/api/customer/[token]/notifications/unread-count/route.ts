import { NextResponse } from "next/server";
import { requireCustomerPortalApiAccess } from "@/lib/customer-portal-v2";
import { prisma } from "@/lib/prisma";

export async function GET(_request: Request, { params }: { params: { token: string } }) {
  const access = await requireCustomerPortalApiAccess(params.token);
  if (!access.ok) return NextResponse.json({ message: access.message }, { status: access.status });

  const count = await prisma.customerNotification.count({
    where: { projectId: access.project.id, isRead: false },
  });

  return NextResponse.json({ count });
}
