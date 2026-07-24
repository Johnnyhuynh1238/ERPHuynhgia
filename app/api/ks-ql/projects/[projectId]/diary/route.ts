import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { getWorkDateVn } from "@/lib/attendance";
import { diaryDateError } from "@/lib/diary-date";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function parseDateParam(raw: string | null): Date {
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return new Date(`${raw}T00:00:00.000Z`);
  }
  return getWorkDateVn();
}

async function ensureKsProject(projectId: string, userId: string) {
  return prisma.project.findFirst({
    where: {
      id: projectId,
      memberAssignments: { some: { userId, role: "pm_engineer" } },
    },
    select: { id: true, name: true },
  });
}

function startOfNextDay(d: Date) {
  return new Date(d.getTime() + 24 * 60 * 60 * 1000);
}

export async function GET(
  req: NextRequest,
  { params }: { params: { projectId: string } },
) {
  const user = await getCurrentUser();
  if (!user?.id) return NextResponse.json({ message: "unauthorized" }, { status: 401 });

  const project = await ensureKsProject(params.projectId, user.id);
  if (!project) return NextResponse.json({ message: "forbidden" }, { status: 403 });

  const entryDate = parseDateParam(req.nextUrl.searchParams.get("date"));
  const nextDay = startOfNextDay(entryDate);

  const diary = await prisma.constructionDiary.findUnique({
    where: {
      projectId_ksId_entryDate: {
        projectId: project.id,
        ksId: user.id,
        entryDate,
      },
    },
    include: { approvedBy: { select: { fullName: true } } },
  });

  // Luồng đề xuất/nhận VT của KS đã gỡ (dùng mua-hàng mới của KT) → không còn hoạt động VT tự động.
  const activities: Array<{
    kind: string;
    at: string;
    label: string;
    href: string;
    sub?: string;
  }> = [];

  return NextResponse.json({
    project: { id: project.id, name: project.name },
    entryDate: entryDate.toISOString().slice(0, 10),
    diary: diary
      ? {
          id: diary.id,
          workerCount: diary.workerCount,
          tasksDone: diary.tasksDone,
          issues: diary.issues,
          taskPhotos: (diary.taskPhotos as unknown as Array<{ key: string; contentType: string }>) || [],
          sitePhotos: (diary.sitePhotos as unknown as Array<{ key: string; contentType: string }>) || [],
          savedAt: diary.savedAt?.toISOString() ?? null,
          approvedAt: diary.approvedAt?.toISOString() ?? null,
          approvedByName: diary.approvedBy?.fullName ?? null,
          updatedAt: diary.updatedAt.toISOString(),
        }
      : null,
    activities,
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { projectId: string } },
) {
  const user = await getCurrentUser();
  if (!user?.id) return NextResponse.json({ message: "unauthorized" }, { status: 401 });

  const project = await ensureKsProject(params.projectId, user.id);
  if (!project) return NextResponse.json({ message: "forbidden" }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "Body JSON không hợp lệ" }, { status: 400 });
  }

  const entryDate = parseDateParam(typeof body.date === "string" ? body.date : null);
  const dateErr = diaryDateError(entryDate);
  if (dateErr) return NextResponse.json({ message: dateErr }, { status: 400 });
  const workerCount = Math.max(0, Math.min(500, Math.floor(Number(body.workerCount) || 0)));
  const tasksDone = String(body.tasksDone ?? "").slice(0, 4000).trim();
  const issuesRaw = body.issues == null ? null : String(body.issues).slice(0, 4000);
  const issues = issuesRaw && issuesRaw.trim() ? issuesRaw : null;

  if (workerCount <= 0) {
    return NextResponse.json({ message: "Số thợ phải > 0" }, { status: 400 });
  }
  if (!tasksDone) {
    return NextResponse.json({ message: "Cần điền mục công việc hôm nay" }, { status: 400 });
  }

  const existing = await prisma.constructionDiary.findUnique({
    where: {
      projectId_ksId_entryDate: {
        projectId: project.id,
        ksId: user.id,
        entryDate,
      },
    },
    select: { approvedAt: true },
  });
  if (existing?.approvedAt) {
    return NextResponse.json(
      { message: "Nhật ký đã được ADMIN duyệt, không sửa được" },
      { status: 403 },
    );
  }

  const now = new Date();
  const saved = await prisma.constructionDiary.upsert({
    where: {
      projectId_ksId_entryDate: {
        projectId: project.id,
        ksId: user.id,
        entryDate,
      },
    },
    create: {
      projectId: project.id,
      ksId: user.id,
      entryDate,
      workerCount,
      tasksDone,
      issues,
      taskPhotos: [] as unknown as Prisma.InputJsonValue,
      sitePhotos: [] as unknown as Prisma.InputJsonValue,
      savedAt: now,
    },
    update: {
      workerCount,
      tasksDone,
      issues,
      savedAt: now,
    },
  });

  return NextResponse.json({
    ok: true,
    diary: {
      id: saved.id,
      workerCount: saved.workerCount,
      tasksDone: saved.tasksDone,
      issues: saved.issues,
      savedAt: saved.savedAt?.toISOString() ?? null,
    },
  });
}
