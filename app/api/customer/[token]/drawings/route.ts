import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCustomerPortalApiAccess } from "@/lib/customer-portal-v2";

export async function GET(_request: Request, { params }: { params: { token: string } }) {
  const access = await requireCustomerPortalApiAccess(params.token);
  if (!access.ok) return NextResponse.json({ message: access.message }, { status: access.status });

  const drawings = await prisma.projectDrawing.findMany({
    where: { projectId: access.project.id },
    orderBy: [{ displayOrder: "asc" }, { uploadedAt: "desc" }],
    include: { uploader: { select: { fullName: true } } },
  });

  return NextResponse.json({ drawings });
}
