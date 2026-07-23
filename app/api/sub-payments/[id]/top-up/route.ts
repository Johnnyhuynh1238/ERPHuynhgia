import { Prisma, SubPaymentStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { canUserAccessSubContract, requireSubContractReadUser } from "@/lib/sub-contract-auth";
import { canCreateOrRequestSubPayment, generateNextSubPaymentCode, startOfUtcDay } from "@/lib/sub-payment-utils";

const bodySchema = z.object({
  amount: z.coerce.number().positive("Số tiền phải lớn hơn 0"),
  description: z.string().trim().max(255).optional().nullable(),
});

// POST /api/sub-payments/[id]/top-up — tạo 1 đợt "bù" cho đợt cha (id) khi đợt đã
// chi nhưng thực chi chưa đủ dự kiến. Đợt bù dùng chung stage với đợt cha; UI hiển
// thị nhãn "N-1", "N-2"… (suy ra theo thứ tự trong cùng stage ở GET payments).
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireSubContractReadUser();
  if (error || !user) return error;

  if (!canCreateOrRequestSubPayment(user.role)) {
    return NextResponse.json({ message: "Không có quyền tạo đợt thanh toán" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const parent = await prisma.subPayment.findUnique({
    where: { id: params.id },
    select: { id: true, stage: true, subContractId: true },
  });
  if (!parent) return NextResponse.json({ message: "Không tìm thấy đợt thanh toán" }, { status: 404 });

  const access = await canUserAccessSubContract(parent.subContractId, { id: user.id, role: user.role });
  if (!access.canAccess) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const amount = parsed.data.amount;
  const description = parsed.data.description?.trim() || `Bù đợt ${parent.stage}`;

  const created = await prisma.$transaction(async (tx) => {
    const code = await generateNextSubPaymentCode(tx);
    return tx.subPayment.create({
      data: {
        code,
        subContractId: parent.subContractId,
        stage: parent.stage, // chung stage với đợt cha → UI đánh nhãn N-1, N-2…
        description,
        expectedAmount: new Prisma.Decimal(amount),
        expectedDate: startOfUtcDay(),
        status: SubPaymentStatus.pending,
      },
      select: { id: true, code: true, stage: true },
    });
  });

  return NextResponse.json({ message: "Đã tạo đợt bù", payment: created });
}
