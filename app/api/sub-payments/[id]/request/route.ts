import { SubPaymentStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { canUserAccessSubContract, requireSubContractReadUser } from "@/lib/sub-contract-auth";
import { canCreateOrRequestSubPayment } from "@/lib/sub-payment-utils";
import { fmtMoney, logProjectActivity } from "@/lib/project-activity-log";

const schema = z.object({
  note: z.string().trim().max(3000).nullable().optional(),
});

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireSubContractReadUser();
  if (error || !user) return error;

  if (!canCreateOrRequestSubPayment(user.role)) {
    return NextResponse.json({ message: "Không có quyền đề xuất chi" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const row = await prisma.subPayment.findUnique({
    where: { id: params.id },
    include: {
      subContract: { select: { projectId: true, code: true, title: true } },
    },
  });

  if (!row) {
    return NextResponse.json({ message: "Không tìm thấy đợt thanh toán" }, { status: 404 });
  }

  const access = await canUserAccessSubContract(row.subContractId, { id: user.id, role: user.role });
  if (!access.canAccess) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  if (row.status !== SubPaymentStatus.pending) {
    return NextResponse.json({ message: "Chỉ đợt pending mới được đề xuất" }, { status: 400 });
  }

  const updated = await prisma.subPayment.update({
    where: { id: row.id },
    data: {
      status: SubPaymentStatus.requested,
      requestedBy: user.id,
      requestedAt: new Date(),
      requestNote: parsed.data.note ?? null,
    },
  });

  await logProjectActivity(prisma, {
    projectId: row.subContract.projectId,
    actorId: user.id,
    entity: "sub_payment",
    entityId: row.id,
    action: "request",
    summary: `Đề xuất chi đợt TT thầu phụ ${row.code} "${row.description}" (HĐ ${row.subContract.code}) — ${fmtMoney(row.expectedAmount)}`,
    metadata: { subContractId: row.subContractId, note: parsed.data.note ?? null },
  });

  return NextResponse.json({ payment: updated, message: "Đã gửi đề xuất chi" });
}
