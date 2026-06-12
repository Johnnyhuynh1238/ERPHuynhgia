import { NextResponse } from "next/server";
import { WorkerStatus } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { canManageWorkers, canViewWorkers, isValidGrade } from "@/lib/worker-management";

const STATUS_SET = new Set<WorkerStatus>([
  "trial",
  "active",
  "standby",
  "inactive",
  "blacklist",
]);

const PHONE_RE = /^[0-9+()\-\s]{8,20}$/;

export async function GET(
  _request: Request,
  { params }: { params: { workerId: string } },
) {
  const user = await getCurrentUser();
  if (!user?.id || !canViewWorkers(user.role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const worker = await prisma.worker.findUnique({
    where: { id: params.workerId },
    include: {
      project: { select: { id: true, name: true } },
      docs: { orderBy: { uploadedAt: "desc" } },
      gradeHistory: {
        orderBy: { createdAt: "desc" },
        include: {
          proposedBy: { select: { id: true, fullName: true } },
          approvedBy: { select: { id: true, fullName: true } },
        },
      },
    },
  });

  if (!worker) {
    return NextResponse.json({ message: "Không tìm thấy thợ" }, { status: 404 });
  }

  return NextResponse.json({ worker });
}

export async function PATCH(
  request: Request,
  { params }: { params: { workerId: string } },
) {
  const user = await getCurrentUser();
  if (!user?.id || !canManageWorkers(user.role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });
  }
  const b = body as Record<string, unknown>;

  const data: Record<string, unknown> = {};

  if (typeof b.fullName === "string" && b.fullName.trim()) {
    data.fullName = b.fullName.trim();
  }
  if ("phone" in b) {
    const v = typeof b.phone === "string" ? b.phone.trim() : "";
    if (v && !PHONE_RE.test(v)) {
      return NextResponse.json({ message: "SĐT không hợp lệ" }, { status: 400 });
    }
    data.phone = v || null;
  }
  if ("cccd" in b) {
    const v = typeof b.cccd === "string" ? b.cccd.trim() : "";
    data.cccd = v || null;
  }
  if ("bankAccount" in b) {
    const v = typeof b.bankAccount === "string" ? b.bankAccount.trim() : "";
    data.bankAccount = v || null;
  }
  if ("bankName" in b) {
    const v = typeof b.bankName === "string" ? b.bankName.trim() : "";
    data.bankName = v || null;
  }
  if ("notes" in b) {
    const v = typeof b.notes === "string" ? b.notes.trim() : "";
    data.notes = v || null;
  }
  if ("projectId" in b) {
    const v = typeof b.projectId === "string" && b.projectId ? b.projectId : null;
    data.projectId = v;
  }
  if ("workerStatus" in b) {
    const v = b.workerStatus;
    if (typeof v !== "string" || !STATUS_SET.has(v as WorkerStatus)) {
      return NextResponse.json({ message: "Trạng thái không hợp lệ" }, { status: 400 });
    }
    data.workerStatus = v as WorkerStatus;
    if (v === "active") {
      const cur = await prisma.worker.findUnique({
        where: { id: params.workerId },
        select: { onboardedAt: true },
      });
      if (cur && !cur.onboardedAt) data.onboardedAt = new Date();
    }
  }
  if ("dailyRate" in b) {
    const raw = b.dailyRate;
    if (raw == null || raw === "") {
      data.dailyRate = null;
    } else {
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0 || n > 50_000_000) {
        return NextResponse.json({ message: "Công nhật không hợp lệ" }, { status: 400 });
      }
      data.dailyRate = Math.round(n);
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ ok: true });
  }

  const updated = await prisma.worker.update({
    where: { id: params.workerId },
    data,
    select: { id: true },
  });

  return NextResponse.json({ ok: true, workerId: updated.id });
}
