import { NextResponse } from "next/server";
import { Prisma, WorkerStatus } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { canViewWorkers, canManageWorkers, isValidGrade } from "@/lib/worker-management";

const STATUS_SET = new Set<WorkerStatus>([
  "trial",
  "active",
  "standby",
  "inactive",
  "blacklist",
]);

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user?.id || !canViewWorkers(user.role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const projectId = searchParams.get("projectId");
  const gradeRaw = searchParams.get("grade");
  const q = searchParams.get("q")?.trim();

  const where: Prisma.WorkerWhereInput = {};
  if (status && STATUS_SET.has(status as WorkerStatus)) {
    where.workerStatus = status as WorkerStatus;
  }
  if (projectId === "none") {
    where.projectId = null;
  } else if (projectId) {
    where.projectId = projectId;
  }
  if (gradeRaw) {
    const g = Number(gradeRaw);
    if (isValidGrade(g)) where.grade = g;
  }
  if (q) {
    where.OR = [
      { fullName: { contains: q, mode: "insensitive" } },
      { phone: { contains: q } },
      { cccd: { contains: q } },
    ];
  }

  const sortStandbyByRating = status === "standby";

  const workers = await prisma.worker.findMany({
    where,
    include: {
      project: { select: { id: true, name: true } },
    },
    orderBy: sortStandbyByRating
      ? [{ rating: { sort: "desc", nulls: "last" } }, { fullName: "asc" }]
      : [{ workerStatus: "asc" }, { fullName: "asc" }],
    take: 500,
  });

  return NextResponse.json({
    workers: workers.map((w) => ({
      id: w.id,
      fullName: w.fullName,
      phone: w.phone,
      cccd: w.cccd,
      role: w.role,
      grade: w.grade,
      workerStatus: w.workerStatus,
      dailyRate: w.dailyRate,
      rating: w.rating,
      onboardedAt: w.onboardedAt,
      project: w.project,
      bankAccount: w.bankAccount,
      bankName: w.bankName,
    })),
  });
}

const PHONE_RE = /^[0-9+()\-\s]{8,20}$/;

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user?.id || !canManageWorkers(user.role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });
  }
  const b = body as Record<string, unknown>;

  const fullName = typeof b.fullName === "string" ? b.fullName.trim() : "";
  if (!fullName) {
    return NextResponse.json({ message: "Thiếu họ tên" }, { status: 400 });
  }
  const phone =
    typeof b.phone === "string" && b.phone.trim() ? b.phone.trim() : null;
  if (phone && !PHONE_RE.test(phone)) {
    return NextResponse.json({ message: "SĐT không hợp lệ" }, { status: 400 });
  }
  const cccd =
    typeof b.cccd === "string" && b.cccd.trim() ? b.cccd.trim() : null;
  const bankAccount =
    typeof b.bankAccount === "string" && b.bankAccount.trim()
      ? b.bankAccount.trim()
      : null;
  const bankName =
    typeof b.bankName === "string" && b.bankName.trim() ? b.bankName.trim() : null;
  const notes =
    typeof b.notes === "string" && b.notes.trim() ? b.notes.trim() : null;

  const gradeRaw = b.grade;
  let grade: number | null = null;
  if (gradeRaw != null && gradeRaw !== "") {
    const g = Number(gradeRaw);
    if (!isValidGrade(g)) {
      return NextResponse.json({ message: "Bậc phải từ 1 đến 5" }, { status: 400 });
    }
    grade = g;
  }

  const statusRaw = b.workerStatus;
  let workerStatus: WorkerStatus = "trial";
  if (typeof statusRaw === "string" && STATUS_SET.has(statusRaw as WorkerStatus)) {
    workerStatus = statusRaw as WorkerStatus;
  }

  const projectId =
    typeof b.projectId === "string" && b.projectId ? b.projectId : null;

  let dailyRate: number | null = null;
  if (b.dailyRate != null && b.dailyRate !== "") {
    const n = Number(b.dailyRate);
    if (!Number.isFinite(n) || n < 0 || n > 50_000_000) {
      return NextResponse.json({ message: "Công nhật không hợp lệ" }, { status: 400 });
    }
    dailyRate = Math.round(n);
  }
  if (dailyRate == null && grade != null) {
    const rate = await prisma.gradeRate.findFirst({
      where: { grade, isCurrent: true },
      select: { dailyRate: true },
    });
    if (rate) dailyRate = rate.dailyRate;
  }

  const created = await prisma.worker.create({
    data: {
      fullName,
      phone,
      cccd,
      bankAccount,
      bankName,
      grade,
      workerStatus,
      dailyRate,
      notes,
      projectId,
      role: "tho",
      status: "active",
      createdById: user.id,
      onboardedAt: workerStatus === "active" ? new Date() : null,
    },
    select: { id: true },
  });

  return NextResponse.json({ ok: true, workerId: created.id });
}
