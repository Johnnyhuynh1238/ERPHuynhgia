import { Prisma, SubPaymentStatus, UserRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { canUserAccessSubContract, requireSubContractReadUser } from "@/lib/sub-contract-auth";
import { canViewSubContractFinancial } from "@/lib/sub-contract-utils";
import {
  canCreateOrRequestSubPayment,
  deriveExpectedValues,
  generateNextSubPaymentCode,
  normalizeSubPaymentDate,
  serializeSubPayment,
} from "@/lib/sub-payment-utils";

const createRowSchema = z.object({
  stage: z.number().int().min(1).max(10).optional(),
  description: z.string().trim().min(1, "Mô tả đợt thanh toán là bắt buộc"),
  linkedTaskId: z.string().uuid().nullable().optional(),
  expectedAmount: z.number().positive().nullable().optional(),
  percentage: z.number().positive().max(1000).nullable().optional(),
  expectedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.nativeEnum(SubPaymentStatus).optional(),
  requestNow: z.boolean().optional(),
  requestNote: z.string().trim().max(3000).nullable().optional(),
});

const createPayloadSchema = z.object({
  payments: z.array(createRowSchema).min(1).max(10),
});

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

  const contract = await prisma.subContract.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      contractValue: true,
      status: true,
      linkedTasks: {
        include: {
          task: {
            select: { id: true, code: true, name: true, status: true },
          },
        },
      },
    },
  });

  if (!contract) {
    return NextResponse.json({ message: "Không tìm thấy hợp đồng" }, { status: 404 });
  }

  const canViewFinancial = canViewSubContractFinancial(user.role);

  const payments = await prisma.subPayment.findMany({
    where: { subContractId: params.id },
    include: {
      linkedTask: { select: { id: true, code: true, name: true, status: true } },
      requester: { select: { id: true, fullName: true } },
      approver: { select: { id: true, fullName: true } },
      payer: { select: { id: true, fullName: true } },
    },
    orderBy: [{ stage: "asc" }, { createdAt: "asc" }],
  });

  const paidTotal = payments
    .filter((x) => x.status === SubPaymentStatus.paid)
    .reduce((sum, x) => sum + Number(x.actualAmount || 0), 0);

  const percentTotal = payments.reduce((sum, x) => sum + Number(x.percentage || 0), 0);

  return NextResponse.json({
    contract: {
      id: contract.id,
      status: contract.status,
      contractValue: canViewFinancial ? Number(contract.contractValue) : null,
      canViewFinancial,
    },
    linkedTasks: contract.linkedTasks.map((x) => x.task),
    payments: payments.map((row) => serializeSubPayment(row, canViewFinancial)),
    totals: {
      percentTotal: canViewFinancial ? Math.round(percentTotal * 100) / 100 : null,
      paidTotal: canViewFinancial ? Math.round(paidTotal * 100) / 100 : null,
    },
    capabilities: {
      canCreate: canCreateOrRequestSubPayment(user.role),
      canRequest: canCreateOrRequestSubPayment(user.role),
      canApprove: user.role === UserRole.admin,
      canMarkPaid: user.role === UserRole.admin || user.role === UserRole.accountant,
    },
  });
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireSubContractReadUser();
  if (error || !user) return error;

  if (!canCreateOrRequestSubPayment(user.role)) {
    return NextResponse.json({ message: "Không có quyền tạo lịch thanh toán" }, { status: 403 });
  }

  const access = await canUserAccessSubContract(params.id, { id: user.id, role: user.role });
  if (!access.projectId) {
    return NextResponse.json({ message: "Không tìm thấy hợp đồng" }, { status: 404 });
  }

  if (!access.canAccess) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createPayloadSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const payload = parsed.data;

  const contract = await prisma.subContract.findUnique({
    where: { id: params.id },
    select: { id: true, contractValue: true, projectId: true },
  });

  if (!contract) {
    return NextResponse.json({ message: "Không tìm thấy hợp đồng" }, { status: 404 });
  }

  const contractValue = Number(contract.contractValue);

  const requestTaskIds = payload.payments
    .map((x) => x.linkedTaskId)
    .filter((x): x is string => Boolean(x));

  if (requestTaskIds.length > 0) {
    const validCount = await prisma.task.count({
      where: {
        id: { in: Array.from(new Set(requestTaskIds)) },
        projectId: contract.projectId,
        isActive: true,
      },
    });

    if (validCount !== Array.from(new Set(requestTaskIds)).length) {
      return NextResponse.json({ message: "Có công việc liên kết không hợp lệ" }, { status: 400 });
    }
  }

  const normalizedRows = payload.payments.map((row) => {
    const derived = deriveExpectedValues({
      contractValue,
      percentage: row.percentage ?? null,
      expectedAmount: row.expectedAmount ?? null,
    });

    const expectedDate = normalizeSubPaymentDate(row.expectedDate);
    if (!expectedDate) throw new Error("Ngày dự kiến không hợp lệ");

    return {
      description: row.description,
      linkedTaskId: row.linkedTaskId ?? null,
      expectedDate,
      expectedAmount: derived.expectedAmount,
      percentage: derived.percentage,
      stage: row.stage,
      status: row.requestNow || row.status === SubPaymentStatus.requested ? SubPaymentStatus.requested : SubPaymentStatus.pending,
      requestNote: row.requestNote ?? null,
    };
  });

  const created = await prisma.$transaction(async (tx) => {
    const existing = await tx.subPayment.findMany({
      where: { subContractId: params.id },
      select: { stage: true },
      orderBy: [{ stage: "asc" }],
    });

    let nextStage = existing.length > 0 ? Math.max(...existing.map((x) => x.stage)) + 1 : 1;

    const out = [] as Array<{ id: string }>;

    for (const row of normalizedRows) {
      const code = await generateNextSubPaymentCode(tx);

      const createdRow = await tx.subPayment.create({
        data: {
          code,
          subContractId: params.id,
          stage: row.stage ?? nextStage,
          description: row.description,
          linkedTaskId: row.linkedTaskId,
          expectedAmount: new Prisma.Decimal(row.expectedAmount),
          expectedDate: row.expectedDate,
          percentage: new Prisma.Decimal(row.percentage),
          status: row.status,
          ...(row.status === SubPaymentStatus.requested
            ? {
                requestedBy: user.id,
                requestedAt: new Date(),
                requestNote: row.requestNote,
              }
            : {}),
        },
        select: { id: true },
      });

      out.push(createdRow);
      nextStage += 1;
    }

    return tx.subPayment.findMany({
      where: { id: { in: out.map((x) => x.id) } },
      include: {
        linkedTask: { select: { id: true, code: true, name: true, status: true } },
        requester: { select: { id: true, fullName: true } },
        approver: { select: { id: true, fullName: true } },
        payer: { select: { id: true, fullName: true } },
      },
      orderBy: [{ stage: "asc" }, { createdAt: "asc" }],
    });
  });

  const percentTotal = await prisma.subPayment.aggregate({
    where: { subContractId: params.id, status: { not: SubPaymentStatus.cancelled } },
    _sum: { percentage: true },
  });

  const totalPercent = Number(percentTotal._sum.percentage || 0);

  return NextResponse.json({
    payments: created.map((row) => serializeSubPayment(row, true)),
    warning: totalPercent > 100 ? "Tổng % lịch thanh toán đang vượt 100% (vẫn cho phép lưu theo cấu hình linh hoạt)." : null,
    message: "Đã tạo lịch thanh toán",
  });
}
