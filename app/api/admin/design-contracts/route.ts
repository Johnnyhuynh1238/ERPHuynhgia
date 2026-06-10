import { NextResponse } from "next/server";
import { z } from "zod";
import { DesignContractStepKind } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { serializeDesignContract } from "@/lib/design-contract-serialize";

const CreateSchema = z.object({
  customerName: z.string().trim().min(1),
  customerPhone: z.string().trim().min(6),
  leadId: z.string().uuid().nullable().optional(),
  signedAt: z.string().min(8),
  totalValue: z.number().nullable().optional(),
  notes: z.string().nullable().optional(),
});

const STEP_KINDS: DesignContractStepKind[] = [
  "mat_bang",
  "mat_tien_3d",
  "noi_that",
  "shop_drawing",
];

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user?.id) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "JSON không hợp lệ" }, { status: 400 });
  }
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Dữ liệu không hợp lệ", issues: parsed.error.issues }, { status: 400 });
  }

  const { customerName, customerPhone, leadId, signedAt, totalValue, notes } = parsed.data;

  const contract = await prisma.designContract.create({
    data: {
      customerName,
      customerPhone,
      leadId: leadId ?? null,
      signedAt: new Date(signedAt),
      totalValue: totalValue ?? null,
      notes: notes ?? null,
      steps: { create: STEP_KINDS.map((kind) => ({ kind })) },
    },
    include: { steps: true },
  });

  // Bump lead status sang 'signed' nếu chưa
  if (leadId) {
    await prisma.baogiaLead
      .update({
        where: { id: leadId },
        data: { status: "signed" },
      })
      .catch(() => null);
  }

  return NextResponse.json(serializeDesignContract(contract), { status: 201 });
}
