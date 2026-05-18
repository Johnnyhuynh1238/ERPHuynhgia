import { Prisma, SubPaymentStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { canUserAccessSubContract, requireSubContractReadUser } from "@/lib/sub-contract-auth";
import { canViewSubContractFinancial } from "@/lib/sub-contract-utils";
import {
  SUB_PAYMENT_EDITABLE_STATUSES,
  canPatchOrDeleteSubPayment,
  deriveExpectedValues,
  normalizeSubPaymentDate,
  serializeSubPayment,
} from "@/lib/sub-payment-utils";
import { buildDiff, fmtDate, fmtMoney, joinSummary, logProjectActivity } from "@/lib/project-activity-log";

const patchSchema = z.object({
  stage: z.number().int().min(1).max(10).optional(),
  description: z.string().trim().min(1).optional(),
  linkedTaskId: z.string().uuid().nullable().optional(),
  expectedAmount: z.number().positive().nullable().optional(),
  percentage: z.number().positive().max(1000).nullable().optional(),
  expectedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status: z.enum([SubPaymentStatus.pending, SubPaymentStatus.requested, SubPaymentStatus.approved, SubPaymentStatus.cancelled]).optional(),
  requestNote: z.string().trim().max(3000).nullable().optional(),
  approveNote: z.string().trim().max(3000).nullable().optional(),
});

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireSubContractReadUser();
  if (error || !user) return error;

  if (!canPatchOrDeleteSubPayment(user.role)) {
    return NextResponse.json({ message: "Không có quyền cập nhật lịch thanh toán" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const payload = parsed.data;

  const row = await prisma.subPayment.findUnique({
    where: { id: params.id },
    include: {
      subContract: {
        select: {
          id: true,
          projectId: true,
          contractValue: true,
          code: true,
          title: true,
        },
      },
    },
  });

  if (!row) {
    return NextResponse.json({ message: "Không tìm thấy đợt thanh toán" }, { status: 404 });
  }

  const access = await canUserAccessSubContract(row.subContractId, { id: user.id, role: user.role });
  if (!access.canAccess) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  if (row.status === SubPaymentStatus.paid) {
    return NextResponse.json({ message: "Đợt đã chi không thể chỉnh sửa" }, { status: 400 });
  }

  if (row.status === SubPaymentStatus.cancelled) {
    return NextResponse.json({ message: "Đợt đã hủy không thể chỉnh sửa" }, { status: 400 });
  }

  const linkedTaskId = payload.linkedTaskId === undefined ? row.linkedTaskId : payload.linkedTaskId;

  if (linkedTaskId) {
    const task = await prisma.task.findFirst({
      where: {
        id: linkedTaskId,
        projectId: row.subContract.projectId,
        isActive: true,
      },
      select: { id: true },
    });

    if (!task) {
      return NextResponse.json({ message: "Task liên kết không hợp lệ" }, { status: 400 });
    }
  }

  const contractValue = Number(row.subContract.contractValue);
  const shouldRecomputeValues = payload.percentage !== undefined || payload.expectedAmount !== undefined;

  let recomputed: { percentage: number; expectedAmount: number } | null = null;
  if (shouldRecomputeValues) {
    recomputed = deriveExpectedValues({
      contractValue,
      percentage: payload.percentage ?? Number(row.percentage || 0),
      expectedAmount: payload.expectedAmount ?? Number(row.expectedAmount),
    });
  }

  const expectedDate = payload.expectedDate ? normalizeSubPaymentDate(payload.expectedDate) : row.expectedDate;
  if (!expectedDate) {
    return NextResponse.json({ message: "Ngày dự kiến không hợp lệ" }, { status: 400 });
  }

  const updated = await prisma.subPayment.update({
    where: { id: row.id },
    data: {
      ...(payload.stage !== undefined ? { stage: payload.stage } : {}),
      ...(payload.description !== undefined ? { description: payload.description } : {}),
      ...(payload.linkedTaskId !== undefined ? { linkedTaskId: payload.linkedTaskId } : {}),
      ...(payload.expectedDate !== undefined ? { expectedDate } : {}),
      ...(recomputed
        ? {
            percentage: new Prisma.Decimal(recomputed.percentage),
            expectedAmount: new Prisma.Decimal(recomputed.expectedAmount),
          }
        : {}),
      ...(payload.status !== undefined ? { status: payload.status } : {}),
      ...(payload.requestNote !== undefined ? { requestNote: payload.requestNote } : {}),
      ...(payload.approveNote !== undefined ? { approveNote: payload.approveNote } : {}),
    },
    include: {
      linkedTask: { select: { id: true, code: true, name: true, status: true } },
      requester: { select: { id: true, fullName: true } },
      approver: { select: { id: true, fullName: true } },
      payer: { select: { id: true, fullName: true } },
    },
  });

  const canViewFinancial = canViewSubContractFinancial(user.role);

  const { diff, lines } = buildDiff(
    {
      stage: row.stage,
      description: row.description,
      expectedAmount: row.expectedAmount ? Number(row.expectedAmount) : null,
      percentage: row.percentage ? Number(row.percentage) : null,
      expectedDate: row.expectedDate,
      status: row.status,
      linkedTaskId: row.linkedTaskId,
      requestNote: row.requestNote ?? null,
      approveNote: row.approveNote ?? null,
    },
    {
      stage: updated.stage,
      description: updated.description,
      expectedAmount: updated.expectedAmount ? Number(updated.expectedAmount) : null,
      percentage: updated.percentage ? Number(updated.percentage) : null,
      expectedDate: updated.expectedDate,
      status: updated.status,
      linkedTaskId: updated.linkedTaskId,
      requestNote: updated.requestNote ?? null,
      approveNote: updated.approveNote ?? null,
    },
    [
      { key: "stage", label: "Đợt" },
      { key: "description", label: "Mô tả" },
      { key: "expectedAmount", label: "Số tiền dự kiến", format: fmtMoney },
      { key: "percentage", label: "%", format: (v) => (v == null ? "—" : `${v}%`) },
      { key: "expectedDate", label: "Ngày dự kiến", format: fmtDate },
      { key: "status", label: "Trạng thái" },
      { key: "linkedTaskId", label: "Task liên kết" },
      { key: "requestNote", label: "Ghi chú đề nghị" },
      { key: "approveNote", label: "Ghi chú duyệt" },
    ],
  );

  if (Object.keys(diff).length > 0) {
    await logProjectActivity(prisma, {
      projectId: row.subContract.projectId,
      actorId: user.id,
      entity: "sub_payment",
      entityId: updated.id,
      action: "update",
      summary: joinSummary(`Sửa đợt TT thầu phụ ${updated.code} (HĐ ${row.subContract.code})`, lines, `Cập nhật đợt TT thầu phụ ${updated.code}`),
      diff,
      metadata: { subContractId: row.subContractId },
    });
  }

  return NextResponse.json({
    payment: serializeSubPayment(updated, canViewFinancial),
    message: "Đã cập nhật đợt thanh toán",
  });
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireSubContractReadUser();
  if (error || !user) return error;

  if (!canPatchOrDeleteSubPayment(user.role)) {
    return NextResponse.json({ message: "Không có quyền xóa đợt thanh toán" }, { status: 403 });
  }

  const row = await prisma.subPayment.findUnique({
    where: { id: params.id },
    include: {
      subContract: { select: { id: true, projectId: true, code: true, title: true } },
    },
  });

  if (!row) {
    return NextResponse.json({ message: "Không tìm thấy đợt thanh toán" }, { status: 404 });
  }

  const access = await canUserAccessSubContract(row.subContractId, { id: user.id, role: user.role });
  if (!access.canAccess) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  if (row.status === SubPaymentStatus.paid) {
    return NextResponse.json({ message: "Đợt đã chi không thể hủy/xóa" }, { status: 400 });
  }

  if (row.status === SubPaymentStatus.pending) {
    await prisma.subPayment.delete({ where: { id: row.id } });

    await logProjectActivity(prisma, {
      projectId: row.subContract.projectId,
      actorId: user.id,
      entity: "sub_payment",
      entityId: row.id,
      action: "delete",
      summary: `Xóa đợt TT thầu phụ ${row.code} "${row.description}" (HĐ ${row.subContract.code}) — ${fmtMoney(row.expectedAmount)}`,
      snapshot: row,
      metadata: { subContractId: row.subContractId, previousStatus: row.status },
    });

    return NextResponse.json({ hardDeleted: true, message: "Đã xóa đợt thanh toán (pending)" });
  }

  const updated = await prisma.subPayment.update({
    where: { id: row.id },
    data: { status: SubPaymentStatus.cancelled },
    include: {
      linkedTask: { select: { id: true, code: true, name: true, status: true } },
      requester: { select: { id: true, fullName: true } },
      approver: { select: { id: true, fullName: true } },
      payer: { select: { id: true, fullName: true } },
    },
  });

  const canViewFinancial = canViewSubContractFinancial(user.role);

  await logProjectActivity(prisma, {
    projectId: row.subContract.projectId,
    actorId: user.id,
    entity: "sub_payment",
    entityId: row.id,
    action: "cancel",
    summary: `Hủy đợt TT thầu phụ ${row.code} "${row.description}" (HĐ ${row.subContract.code}) — ${fmtMoney(row.expectedAmount)}`,
    snapshot: row,
    metadata: { subContractId: row.subContractId, previousStatus: row.status },
  });

  return NextResponse.json({
    hardDeleted: false,
    payment: serializeSubPayment(updated, canViewFinancial),
    message: "Đợt không còn pending đã chuyển sang cancelled",
  });
}
