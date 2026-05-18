import { SubPaymentStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { canUserAccessSubContract, requireSubContractReadUser } from "@/lib/sub-contract-auth";
import { fmtMoney, logProjectActivity } from "@/lib/project-activity-log";

const schema = z.object({
  note: z.string().trim().max(3000).nullable().optional(),
});

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireSubContractReadUser();
  if (error || !user) return error;

  if (user.role !== "admin") {
    return NextResponse.json({ message: "Chỉ admin được duyệt" }, { status: 403 });
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

  if (row.status !== SubPaymentStatus.requested) {
    return NextResponse.json({ message: "Chỉ đợt requested mới được duyệt" }, { status: 400 });
  }

  const updated = await prisma.subPayment.update({
    where: { id: row.id },
    data: {
      status: SubPaymentStatus.approved,
      approvedBy: user.id,
      approvedAt: new Date(),
      approveNote: parsed.data.note ?? null,
    },
  });

  await logProjectActivity(prisma, {
    projectId: row.subContract.projectId,
    actorId: user.id,
    entity: "sub_payment",
    entityId: row.id,
    action: "approve",
    summary: `Duyệt đợt TT thầu phụ ${row.code} "${row.description}" (HĐ ${row.subContract.code}) — ${fmtMoney(row.expectedAmount)}`,
    metadata: { subContractId: row.subContractId, note: parsed.data.note ?? null },
  });

  return NextResponse.json({ payment: updated, message: "Đã duyệt đề xuất chi" });
}
