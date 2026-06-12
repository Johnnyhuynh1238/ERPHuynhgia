import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { canProposeGrade, isValidGrade } from "@/lib/worker-management";

export async function POST(
  request: Request,
  { params }: { params: { workerId: string } },
) {
  const user = await getCurrentUser();
  if (!user?.id || !canProposeGrade(user.role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });
  }
  const b = body as Record<string, unknown>;

  const toGrade = Number(b.toGrade);
  if (!isValidGrade(toGrade)) {
    return NextResponse.json({ message: "Bậc đích phải từ 1 đến 5" }, { status: 400 });
  }
  const reason = typeof b.reason === "string" ? b.reason.trim() : "";
  if (reason.length < 5) {
    return NextResponse.json({ message: "Lý do cần ít nhất 5 ký tự" }, { status: 400 });
  }
  const evidenceUrl =
    typeof b.evidenceUrl === "string" && b.evidenceUrl.trim()
      ? b.evidenceUrl.trim()
      : null;

  const worker = await prisma.worker.findUnique({
    where: { id: params.workerId },
    select: { id: true, grade: true },
  });
  if (!worker) {
    return NextResponse.json({ message: "Không tìm thấy thợ" }, { status: 404 });
  }
  if (worker.grade === toGrade) {
    return NextResponse.json({ message: "Thợ đã ở bậc này" }, { status: 400 });
  }

  const pending = await prisma.gradeHistory.findFirst({
    where: { workerId: worker.id, status: "pending" },
    select: { id: true },
  });
  if (pending) {
    return NextResponse.json(
      { message: "Còn đề xuất chờ duyệt cho thợ này" },
      { status: 409 },
    );
  }

  const created = await prisma.gradeHistory.create({
    data: {
      workerId: worker.id,
      fromGrade: worker.grade,
      toGrade,
      reason,
      evidenceUrl,
      status: "pending",
      proposedById: user.id,
    },
    select: { id: true },
  });

  return NextResponse.json({ ok: true, proposalId: created.id });
}
