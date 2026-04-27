import { NextResponse } from "next/server";
import { QcReviewAction, UserRole } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getTaskWithAccess } from "@/lib/task-permissions";
import { setTaskInspected } from "@/lib/task-status-auto";

const reviewSchema = z.object({
  action: z.nativeEnum(QcReviewAction),
  note: z.string().optional(),
});

function canReviewQc(role: string) {
  return role === UserRole.admin || role === UserRole.construction_manager;
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });

  const { task, allowed } = await getTaskWithAccess(params.id, { id: user.id, role: user.role });
  if (!task) return NextResponse.json({ message: "Không tìm thấy task" }, { status: 404 });
  if (!allowed) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  if (!canReviewQc(user.role)) return NextResponse.json({ message: "Không có quyền duyệt QC" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const parsed = reviewSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });

  if (parsed.data.action === QcReviewAction.rejected && !String(parsed.data.note || "").trim()) {
    return NextResponse.json({ message: "Từ chối phải có lý do" }, { status: 400 });
  }

  const review = await prisma.qcReview.create({
    data: {
      taskId: params.id,
      action: parsed.data.action,
      reviewerId: user.id,
      note: parsed.data.note?.trim() || null,
    },
  });

  if (parsed.data.action === QcReviewAction.approved) {
    await setTaskInspected(params.id, user.id, "qc approved", { db: prisma });
  }

  return NextResponse.json({ review, message: parsed.data.action === QcReviewAction.approved ? "Đã duyệt QC" : "Đã từ chối QC" });
}
