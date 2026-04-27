import { Prisma, SubPaymentStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { canUserAccessSubContract, requireSubContractReadUser } from "@/lib/sub-contract-auth";
import { canMarkPaidSubPayment, getPaidProgressWarning, normalizeSubPaymentDate } from "@/lib/sub-payment-utils";

const schema = z.object({
  actualAmount: z.number().positive().optional(),
  actualPaidDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  receiptUrl: z.string().trim().min(1, "Bắt buộc upload chứng từ").optional(),
  paymentMethod: z.string().trim().min(1, "Phương thức thanh toán là bắt buộc"),
  note: z.string().trim().max(3000).nullable().optional(),
});

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireSubContractReadUser();
  if (error || !user) return error;

  if (!canMarkPaidSubPayment(user.role)) {
    return NextResponse.json({ message: "Không có quyền mark đã chi" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const payload = parsed.data;
  if (!payload.receiptUrl?.trim()) {
    return NextResponse.json({ message: "Bắt buộc upload phiếu chi" }, { status: 400 });
  }

  const row = await prisma.subPayment.findUnique({
    where: { id: params.id },
    include: {
      subContract: {
        select: { id: true, projectId: true, contractValue: true },
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

  if (row.status !== SubPaymentStatus.approved) {
    return NextResponse.json({ message: "Chỉ đợt approved mới được mark paid" }, { status: 400 });
  }

  const amount = payload.actualAmount ?? Number(row.expectedAmount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ message: "Số tiền thực chi không hợp lệ" }, { status: 400 });
  }

  const paidDate = normalizeSubPaymentDate(payload.actualPaidDate || undefined) || normalizeSubPaymentDate(new Date().toISOString().slice(0, 10));
  if (!paidDate) {
    return NextResponse.json({ message: "Ngày chi không hợp lệ" }, { status: 400 });
  }

  const paidAggregate = await prisma.subPayment.aggregate({
    where: {
      subContractId: row.subContractId,
      status: SubPaymentStatus.paid,
      id: { not: row.id },
    },
    _sum: { actualAmount: true },
  });

  const paidBefore = Number(paidAggregate._sum.actualAmount || 0);
  const paidAfter = paidBefore + amount;
  const contractValue = Number(row.subContract.contractValue);

  const warning = getPaidProgressWarning(paidAfter, contractValue);
  if (warning?.type === "overflow") {
    return NextResponse.json({
      message: "Tổng đã chi vượt giá trị hợp đồng, thao tác bị chặn",
      paidAfter,
      contractValue,
    }, { status: 400 });
  }

  const updated = await prisma.subPayment.update({
    where: { id: row.id },
    data: {
      status: SubPaymentStatus.paid,
      actualAmount: new Prisma.Decimal(amount),
      actualPaidDate: paidDate,
      receiptUrl: payload.receiptUrl.trim(),
      paidBy: user.id,
      paidAt: new Date(),
      payNote: payload.note ? `[${payload.paymentMethod}] ${payload.note}` : `[${payload.paymentMethod}]`,
    },
    include: {
      linkedTask: { select: { id: true, code: true, name: true, status: true } },
      requester: { select: { id: true, fullName: true } },
      approver: { select: { id: true, fullName: true } },
      payer: { select: { id: true, fullName: true } },
    },
  });

  return NextResponse.json({
    payment: updated,
    warning: warning?.type === "warning" ? warning.message : null,
    message: "Đã cập nhật trạng thái đã chi",
  });
}
