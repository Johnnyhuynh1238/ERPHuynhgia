import { NextResponse } from "next/server";
import { z } from "zod";
import { DesignContractStepKind } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

const Schema = z.object({
  name: z.string().trim().min(1),
  phone: z.string().trim().min(6),
  stage: z.number().int().min(1).max(3),
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
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Dữ liệu không hợp lệ", issues: parsed.error.issues }, { status: 400 });
  }
  const { name, phone, stage, notes } = parsed.data;

  // Mọi case đều bắt đầu bằng tạo BaogiaLead
  const leadStatus = stage === 1 ? "new" : stage === 2 ? "contacted" : "signed";
  const lead = await prisma.baogiaLead.create({
    data: {
      name,
      phone,
      source: "manual_admin",
      status: leadStatus,
      contactedAt: stage >= 2 ? new Date() : null,
      adminNotes: notes ?? null,
    },
  });

  let designContractId: string | null = null;
  if (stage === 3) {
    const contract = await prisma.designContract.create({
      data: {
        customerName: name,
        customerPhone: phone,
        leadId: lead.id,
        signedAt: new Date(),
        steps: { create: STEP_KINDS.map((kind) => ({ kind })) },
      },
    });
    designContractId = contract.id;
  }

  return NextResponse.json({ leadId: lead.id, designContractId }, { status: 201 });
}
