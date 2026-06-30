import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";

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

  const take = Math.max(1, Math.min(30, Number(req.nextUrl.searchParams.get("take")) || 14));

  const diaries = await prisma.constructionDiary.findMany({
    where: { projectId: params.projectId, ksId: user.id },
    orderBy: { entryDate: "desc" },
    take,
    select: {
      id: true,
      entryDate: true,
      workerCount: true,
      tasksDone: true,
      issues: true,
      taskPhotos: true,
      sitePhotos: true,
      savedAt: true,
    },
  });

  return NextResponse.json({
    items: diaries.map((d) => ({
      id: d.id,
      entryDate: d.entryDate.toISOString().slice(0, 10),
      workerCount: d.workerCount,
      tasksDone: d.tasksDone,
      issues: d.issues,
      taskCount: ((d.taskPhotos as unknown as unknown[]) || []).length,
      siteCount: ((d.sitePhotos as unknown as unknown[]) || []).length,
      savedAt: d.savedAt?.toISOString() ?? null,
    })),
  });
}
