import { WorkerAttendanceSession } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-helpers";
import { getWorkDateVn } from "@/lib/attendance";
import { fireAndForget, notifyKsWorkerAttendance } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const SESSIONS = new Set(["morning", "afternoon"]);

async function assertProjectAccess(userId: string, role: string, projectId: string) {
  if (role === "admin") return true;
  const membership = await prisma.projectMemberAssignment.findFirst({
    where: { userId, projectId },
    select: { id: true },
  });
  return Boolean(membership);
}

export async function GET(request: Request, { params }: { params: { projectId: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }
  const ok = await assertProjectAccess(user.id, user.role, params.projectId);
  if (!ok) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const url = new URL(request.url);
  const sessionParam = url.searchParams.get("session") || "morning";
  if (!SESSIONS.has(sessionParam)) {
    return NextResponse.json({ message: "session không hợp lệ" }, { status: 400 });
  }
  const session = sessionParam as WorkerAttendanceSession;
  const date = getWorkDateVn();

  const [project, workers, attendances] = await Promise.all([
    prisma.project.findUnique({
      where: { id: params.projectId },
      select: { id: true, code: true, name: true },
    }),
    prisma.worker.findMany({
      where: { projectId: params.projectId, status: "active" },
      orderBy: [{ sortRank: "desc" }, { fullName: "asc" }],
      select: {
        id: true,
        fullName: true,
        phone: true,
        role: true,
        sortRank: true,
        idCardPhotoUrl: true,
      },
    }),
    prisma.workerAttendance.findMany({
      where: { projectId: params.projectId, date, session },
      select: { workerId: true, present: true },
    }),
  ]);

  if (!project) return NextResponse.json({ message: "Không tìm thấy dự án" }, { status: 404 });

  const presentMap = new Map(attendances.map((a) => [a.workerId, a.present]));
  const enriched = workers.map((w) => ({
    id: w.id,
    fullName: w.fullName,
    phone: w.phone,
    role: w.role,
    sortRank: w.sortRank,
    hasIdCardPhoto: Boolean(w.idCardPhotoUrl),
    present: presentMap.get(w.id) === true,
  }));

  return NextResponse.json({
    project,
    session,
    date: date.toISOString().slice(0, 10),
    workers: enriched,
  });
}

const SaveSchema = z.object({
  session: z.enum(["morning", "afternoon"]),
  presentWorkerIds: z.array(z.string().uuid()).max(500),
});

export async function POST(request: Request, { params }: { params: { projectId: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }
  const ok = await assertProjectAccess(user.id, user.role, params.projectId);
  if (!ok) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const parsed = SaveSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });
  }
  const { session, presentWorkerIds } = parsed.data;
  const date = getWorkDateVn();

  const activeWorkers = await prisma.worker.findMany({
    where: { projectId: params.projectId, status: "active" },
    select: { id: true },
  });
  const activeIds = new Set(activeWorkers.map((w) => w.id));
  const presentSet = new Set(presentWorkerIds.filter((id) => activeIds.has(id)));

  await prisma.$transaction(async (tx) => {
    for (const workerId of Array.from(activeIds)) {
      const present = presentSet.has(workerId);
      await tx.workerAttendance.upsert({
        where: {
          workerId_date_session: { workerId, date, session },
        },
        create: {
          workerId,
          projectId: params.projectId,
          date,
          session,
          present,
          markedById: user.id,
        },
        update: {
          present,
          markedById: user.id,
          markedAt: new Date(),
        },
      });
    }
    // tăng sortRank cho thợ được tick (hay được chấm = lên đầu lần sau)
    if (presentSet.size) {
      await tx.worker.updateMany({
        where: { id: { in: Array.from(presentSet) } },
        data: { sortRank: { increment: 1 } },
      });
    }
  });

  if (presentSet.size > 0) {
    const presentWorkers = await prisma.worker.findMany({
      where: { id: { in: Array.from(presentSet) } },
      select: { fullName: true },
      orderBy: { sortRank: "desc" },
      take: 4,
    });
    fireAndForget(
      notifyKsWorkerAttendance({
        projectId: params.projectId,
        actorUserId: user.id,
        actorName: user.name || user.email || "KS",
        session,
        date: date.toISOString().slice(0, 10),
        presentCount: presentSet.size,
        totalCount: activeIds.size,
        sampleWorkerNames: presentWorkers.map((w) => w.fullName),
      }),
    );
  }

  return NextResponse.json({ ok: true, savedCount: activeIds.size, presentCount: presentSet.size });
}
