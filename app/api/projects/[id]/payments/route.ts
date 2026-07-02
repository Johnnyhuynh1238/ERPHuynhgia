import { NextResponse } from "next/server";
import { PaymentStatus, ReceiptStatus, UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { normalizePaymentSchedule } from "@/lib/customer-portal-v2";
import { prisma } from "@/lib/prisma";
import { buildProjectAccessWhere } from "@/lib/project-permissions";

function startOfTodayUtc() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }

  if (user.role !== UserRole.admin && user.role !== UserRole.accountant) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const accessWhere = buildProjectAccessWhere({ id: user.id, role: user.role });

  const project = await prisma.project.findFirst({
    where: {
      id: params.id,
      ...accessWhere,
    },
    select: {
      id: true,
      code: true,
      name: true,
      customerName: true,
      contractValue: true,
    },
  });

  if (!project) {
    const exists = await prisma.project.findUnique({ where: { id: params.id }, select: { id: true } });
    if (exists) {
      return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
    }
    return NextResponse.json({ message: "Không tìm thấy dự án" }, { status: 404 });
  }

  const today = startOfTodayUtc();

  await prisma.$transaction([
    prisma.paymentSchedule.updateMany({
      where: {
        projectId: params.id,
        status: PaymentStatus.not_collected,
        expectedDate: { lt: today },
      },
      data: { status: PaymentStatus.customer_late },
    }),
    prisma.paymentSchedule.updateMany({
      where: {
        projectId: params.id,
        status: PaymentStatus.pending,
        OR: [{ dueDate: { lt: today } }, { expectedDate: { lt: today } }],
      },
      data: { status: PaymentStatus.overdue },
    }),
  ]);

  const rows = await prisma.paymentSchedule.findMany({
    where: { projectId: params.id },
    orderBy: [{ type: "asc" }, { installmentNo: "asc" }, { phaseNumber: "asc" }],
    select: {
      id: true,
      type: true,
      installmentNo: true,
      phaseNumber: true,
      description: true,
      milestoneDescription: true,
      percent: true,
      amount: true,
      dueDate: true,
      expectedDate: true,
      paidAt: true,
      paidAmount: true,
      actualPaidDate: true,
      actualPaidAmount: true,
      receiptUrl: true,
      paymentNote: true,
      status: true,
      notes: true,
      receipts: {
        where: { status: { in: [ReceiptStatus.pending, ReceiptStatus.awaiting_approval, ReceiptStatus.received] } },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, code: true, status: true },
      },
    },
  });

  const canEdit = user.role === "admin" || user.role === "accountant";
  const isAdmin = user.role === UserRole.admin;

  return NextResponse.json({
    project: {
      ...project,
      contractValue: Number(project.contractValue),
    },
    payments: rows.map((row) => {
      const normalized = normalizePaymentSchedule(row);
      const activeReceipt = row.receipts[0] || null;
      const { receipts, ...rest } = row;
      void receipts;
      return {
        ...rest,
        percent: Number(row.percent),
        amount: Number(row.amount),
        actualPaidAmount: row.actualPaidAmount ? Number(row.actualPaidAmount) : null,
        paidAmount: row.paidAmount ? Number(row.paidAmount) : null,
        normalized,
        activeReceipt,
      };
    }),
    canEdit,
    isAdmin,
  });
}
