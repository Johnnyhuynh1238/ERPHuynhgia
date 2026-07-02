import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: { projectId: string } },
) {
  try {
    await requireRole(["admin"]);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unauthorized";
    return NextResponse.json({ message: msg }, { status: msg === "403_FORBIDDEN" ? 403 : 401 });
  }

  const take = Math.max(1, Math.min(60, Number(req.nextUrl.searchParams.get("take")) || 30));

  const diaries = await prisma.constructionDiary.findMany({
    where: { projectId: params.projectId },
    orderBy: [{ entryDate: "desc" }, { updatedAt: "desc" }],
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
      approvedAt: true,
      updatedAt: true,
      ks: { select: { id: true, fullName: true } },
      approvedBy: { select: { fullName: true } },
    },
  });

  return NextResponse.json({
    items: diaries.map((d) => ({
      id: d.id,
      entryDate: d.entryDate.toISOString().slice(0, 10),
      workerCount: d.workerCount,
      tasksDone: d.tasksDone,
      issues: d.issues,
      taskPhotos: (d.taskPhotos as unknown as Array<{ key: string; contentType?: string }>) || [],
      sitePhotos: (d.sitePhotos as unknown as Array<{ key: string; contentType?: string }>) || [],
      savedAt: d.savedAt?.toISOString() ?? null,
      approvedAt: d.approvedAt?.toISOString() ?? null,
      approvedByName: d.approvedBy?.fullName ?? null,
      updatedAt: d.updatedAt.toISOString(),
      ksName: d.ks.fullName,
      ksId: d.ks.id,
    })),
  });
}
