import { NextResponse } from "next/server";
import { z } from "zod";
import { DesignContractStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/estimate";

const PatchSchema = z.object({
  customerName: z.string().trim().min(1).optional(),
  customerPhone: z.string().trim().min(1).nullable().optional(),
  signedAt: z.string().min(8).optional(),
  totalValue: z.number().nullable().optional(),
  status: z.nativeEnum(DesignContractStatus).optional(),
  notes: z.string().trim().nullable().optional(),
});

// Sửa HĐ thiết kế (bổ sung SĐT / giá trị / trạng thái…). HĐ thi công sửa ở màn dự án.
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const { error } = await requireAdmin();
  if (error) return error;

  const contract = await prisma.designContract.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!contract) return NextResponse.json({ message: "Không tìm thấy HĐ thiết kế" }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "JSON không hợp lệ" }, { status: 400 });
  }
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Dữ liệu không hợp lệ", issues: parsed.error.issues }, { status: 400 });
  }
  const d = parsed.data;

  await prisma.designContract.update({
    where: { id: params.id },
    data: {
      ...(d.customerName !== undefined ? { customerName: d.customerName } : {}),
      ...(d.customerPhone !== undefined ? { customerPhone: d.customerPhone } : {}),
      ...(d.signedAt !== undefined ? { signedAt: new Date(d.signedAt) } : {}),
      ...(d.totalValue !== undefined ? { totalValue: d.totalValue } : {}),
      ...(d.status !== undefined ? { status: d.status } : {}),
      ...(d.notes !== undefined ? { notes: d.notes } : {}),
    },
  });
  return NextResponse.json({ ok: true });
}
