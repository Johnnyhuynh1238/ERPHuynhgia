import { Prisma, SubContractStatus, SubContractUnit, UserRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { canUserAccessSubContract, requireSubContractReadUser, requireSubContractWriteUser } from "@/lib/sub-contract-auth";
import { appendCancelReason, canViewSubContractFinancial, parseSubContractUnit, serializeSubContract } from "@/lib/sub-contract-utils";

const updateSchema = z.object({
  title: z.string().trim().min(3).optional(),
  scopeOfWork: z.string().trim().min(5).optional(),
  unit: z.nativeEnum(SubContractUnit).optional(),
  unitPrice: z.number().nonnegative().nullable().optional(),
  quantity: z.number().positive().nullable().optional(),
  contractValue: z.number().positive().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  expectedEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().trim().max(5000).nullable().optional(),
  taskIds: z.array(z.string().uuid()).optional(),
});

const cancelSchema = z.object({
  reason: z.string().trim().min(3, "Lý do hủy tối thiểu 3 ký tự"),
});

function normalizeDate(raw: string) {
  const [year, month, day] = raw.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireSubContractReadUser();
  if (error || !user) return error;

  const access = await canUserAccessSubContract(params.id, { id: user.id, role: user.role });
  if (!access.projectId) {
    return NextResponse.json({ message: "Không tìm thấy hợp đồng" }, { status: 404 });
  }

  if (!access.canAccess) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const row = await prisma.subContract.findUnique({
    where: { id: params.id },
    include: {
      project: { select: { id: true, code: true, name: true } },
      subcontractor: {
        select: {
          id: true,
          code: true,
          name: true,
          phone: true,
          altPhone: true,
          email: true,
          address: true,
          bankName: true,
          bankAccount: true,
          bankAccountName: true,
          status: true,
        },
      },
      creator: { select: { id: true, fullName: true } },
      linkedTasks: {
        include: {
          task: {
            select: {
              id: true,
              code: true,
              name: true,
              status: true,
              phase: true,
              plannedStartDate: true,
              plannedEndDate: true,
            },
          },
        },
      },
      files: {
        include: {
          uploader: { select: { id: true, fullName: true } },
        },
        orderBy: { uploadedAt: "desc" },
      },
      _count: {
        select: { payments: true, evaluations: true, files: true, linkedTasks: true },
      },
    },
  });

  if (!row) {
    return NextResponse.json({ message: "Không tìm thấy hợp đồng" }, { status: 404 });
  }

  const canViewFinancial = canViewSubContractFinancial(user.role);
  const serialized = serializeSubContract(row, canViewFinancial);

  return NextResponse.json({
    contract: {
      ...serialized,
      unit: canViewFinancial ? serialized.unit : null,
      project: row.project,
      subcontractor: row.subcontractor,
      creator: row.creator,
      linkedTasks: row.linkedTasks.map((item) => item.task),
      files: row.files,
      paymentCount: row._count.payments,
      evaluationCount: row._count.evaluations,
      fileCount: row._count.files,
      taskCount: row._count.linkedTasks,
      canEdit: user.role === UserRole.admin || (user.role === UserRole.construction_manager && row.status === SubContractStatus.draft),
      canManageFiles: user.role === UserRole.admin || user.role === UserRole.construction_manager,
      canActivate:
        (user.role === UserRole.admin || user.role === UserRole.construction_manager) && row.status === SubContractStatus.draft,
      canComplete:
        (user.role === UserRole.admin || user.role === UserRole.construction_manager) && row.status === SubContractStatus.active,
      canCancel:
        (user.role === UserRole.admin || user.role === UserRole.construction_manager) &&
        (row.status === SubContractStatus.draft || row.status === SubContractStatus.active),
    },
  });
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireSubContractWriteUser();
  if (error || !user) return error;

  const body = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const existed = await prisma.subContract.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      status: true,
      projectId: true,
      startDate: true,
      expectedEndDate: true,
    },
  });

  if (!existed) {
    return NextResponse.json({ message: "Không tìm thấy hợp đồng" }, { status: 404 });
  }

  const access = await canUserAccessSubContract(params.id, { id: user.id, role: user.role });
  if (!access.canAccess) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const isAdmin = user.role === UserRole.admin;
  if (!isAdmin && existed.status !== SubContractStatus.draft) {
    return NextResponse.json({ message: "Chỉ được sửa hợp đồng ở trạng thái nháp" }, { status: 400 });
  }

  const payload = parsed.data;
  const taskIds = payload.taskIds ? Array.from(new Set(payload.taskIds)) : null;

  if (taskIds && taskIds.length > 0) {
    const count = await prisma.task.count({
      where: {
        id: { in: taskIds },
        projectId: existed.projectId,
        isActive: true,
      },
    });

    if (count !== taskIds.length) {
      return NextResponse.json({ message: "Có công việc không hợp lệ trong danh sách liên kết" }, { status: 400 });
    }
  }

  const nextStartDate = payload.startDate ? normalizeDate(payload.startDate) : existed.startDate;
  const nextExpectedEndDate = payload.expectedEndDate ? normalizeDate(payload.expectedEndDate) : existed.expectedEndDate;

  if (nextExpectedEndDate.getTime() < nextStartDate.getTime()) {
    return NextResponse.json({ message: "Ngày kết thúc dự kiến phải >= ngày bắt đầu" }, { status: 400 });
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (taskIds) {
      await tx.subContractTask.deleteMany({ where: { subContractId: params.id } });
      if (taskIds.length > 0) {
        await tx.subContractTask.createMany({
          data: taskIds.map((taskId) => ({ subContractId: params.id, taskId })),
        });
      }
    }

    return tx.subContract.update({
      where: { id: params.id },
      data: {
        ...(payload.title !== undefined ? { title: payload.title } : {}),
        ...(payload.scopeOfWork !== undefined ? { scopeOfWork: payload.scopeOfWork } : {}),
        ...(payload.unit !== undefined ? { unit: parseSubContractUnit(payload.unit) } : {}),
        ...(payload.unitPrice !== undefined ? { unitPrice: payload.unitPrice === null ? null : new Prisma.Decimal(payload.unitPrice) } : {}),
        ...(payload.quantity !== undefined ? { quantity: payload.quantity === null ? null : new Prisma.Decimal(payload.quantity) } : {}),
        ...(payload.contractValue !== undefined ? { contractValue: new Prisma.Decimal(payload.contractValue) } : {}),
        ...(payload.startDate !== undefined ? { startDate: nextStartDate } : {}),
        ...(payload.expectedEndDate !== undefined ? { expectedEndDate: nextExpectedEndDate } : {}),
        ...(payload.notes !== undefined ? { notes: payload.notes || null } : {}),
      },
      include: {
        project: { select: { id: true, code: true, name: true } },
        subcontractor: { select: { id: true, code: true, name: true, phone: true } },
        linkedTasks: {
          include: {
            task: { select: { id: true, code: true, name: true, status: true } },
          },
        },
      },
    });
  });

  const serialized = serializeSubContract(updated, true);

  return NextResponse.json({
    contract: {
      ...serialized,
      subcontractor: updated.subcontractor,
      project: updated.project,
      linkedTasks: updated.linkedTasks.map((item) => item.task),
    },
    message: "Đã cập nhật hợp đồng",
  });
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireSubContractWriteUser();
  if (error || !user) return error;

  const body = await request.json().catch(() => null);
  const parsed = cancelSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Thiếu lý do hủy" }, { status: 400 });
  }

  const existed = await prisma.subContract.findUnique({
    where: { id: params.id },
    select: { id: true, status: true, notes: true },
  });

  if (!existed) {
    return NextResponse.json({ message: "Không tìm thấy hợp đồng" }, { status: 404 });
  }

  const access = await canUserAccessSubContract(params.id, { id: user.id, role: user.role });
  if (!access.canAccess) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  if (existed.status === SubContractStatus.completed || existed.status === SubContractStatus.cancelled) {
    return NextResponse.json({ message: "Hợp đồng đã hoàn tất/hủy, không thể hủy lại" }, { status: 400 });
  }

  const updated = await prisma.subContract.update({
    where: { id: params.id },
    data: {
      status: SubContractStatus.cancelled,
      notes: appendCancelReason(existed.notes, parsed.data.reason),
    },
  });

  const serialized = serializeSubContract(updated, true);

  return NextResponse.json({
    contract: serialized,
    message: "Đã hủy hợp đồng",
  });
}
