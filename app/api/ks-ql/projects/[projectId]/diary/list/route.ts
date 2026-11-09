import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { diaryList } from "@/lib/ks-diary";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: { projectId: string } },
) {
  const user = await getCurrentUser();
  if (!user?.id) return NextResponse.json({ message: "unauthorized" }, { status: 401 });

  const allowed = await prisma.project.findFirst({
    where: {
      id: params.projectId,
      memberAssignments: { some: { userId: user.id, role: "pm_engineer" } },
    },
    select: { id: true },
  });
  if (!allowed) return NextResponse.json({ message: "forbidden" }, { status: 403 });

  return diaryList(req, params.projectId, { id: user.id });
}
