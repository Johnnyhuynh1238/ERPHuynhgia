import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getCustomerPortalOverview,
  normalizePaymentSchedule,
  requireCustomerPortalApiAccess,
} from "@/lib/customer-portal-v2";

export async function GET(_request: Request, { params }: { params: { token: string } }) {
  const access = await requireCustomerPortalApiAccess(params.token);
  if (!access.ok) return NextResponse.json({ message: access.message }, { status: access.status });

  const overview = await getCustomerPortalOverview(access.project.id);
  if (!overview) return NextResponse.json({ message: "Không tìm thấy dự án" }, { status: 404 });

  const [payments, drawings, projectComments] = await Promise.all([
    prisma.paymentSchedule.findMany({
      where: { projectId: access.project.id },
      orderBy: [{ type: "asc" }, { installmentNo: "asc" }, { phaseNumber: "asc" }],
      select: {
        id: true,
        type: true,
        installmentNo: true,
        phaseNumber: true,
        description: true,
        milestoneDescription: true,
        amount: true,
        dueDate: true,
        expectedDate: true,
        status: true,
        paidAt: true,
        paidAmount: true,
        actualPaidDate: true,
        actualPaidAmount: true,
        receiptUrl: true,
        paymentNote: true,
        notes: true,
      },
    }),
    prisma.projectDrawing.findMany({
      where: { projectId: access.project.id },
      orderBy: [{ displayOrder: "asc" }, { uploadedAt: "desc" }],
      select: { id: true, name: true, description: true, fileUrl: true, fileSizeBytes: true, uploadedAt: true },
    }),
    prisma.customerComment.findMany({
      where: { projectId: access.project.id, targetType: "project", targetId: access.project.id, parentId: null },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { threadReplies: { orderBy: { createdAt: "asc" } } },
    }),
  ]);

  const normalizedPayments = payments.map(normalizePaymentSchedule);
  const paidAmount = normalizedPayments.reduce((sum, row) => sum + (row.status === "paid" ? row.paidAmount || row.amount : 0), 0);
  const totalAmount = normalizedPayments.reduce((sum, row) => sum + row.amount, 0);

  return NextResponse.json({
    ...overview,
    drawings,
    comments: projectComments,
    finance: {
      totalAmount,
      paidAmount,
      remainingAmount: Math.max(totalAmount - paidAmount, 0),
      payments: normalizedPayments,
    },
  });
}
