import { NextResponse } from "next/server";
import { z } from "zod";
import { DesignContractStepStatus } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

const PatchSchema = z.object({
  status: z.enum(["pending", "in_progress", "customer_review", "approved"]).optional(),
  notes: z.string().nullable().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: { id: string; stepId: string } },
) {
  const user = await getCurrentUser();
  if (!user?.id) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

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

  const step = await prisma.designContractStep.findUnique({ where: { id: params.stepId } });
  if (!step || step.contractId !== params.id) {
    return NextResponse.json({ message: "Step không thuộc HĐ này" }, { status: 404 });
  }

  const data: { status?: DesignContractStepStatus; notes?: string | null; approvedAt?: Date | null } = {};
  if (parsed.data.status !== undefined) {
    data.status = parsed.data.status;
    // tự set approvedAt khi chuyển sang approved, clear khi rời approved
    if (parsed.data.status === "approved" && step.status !== "approved") data.approvedAt = new Date();
    if (parsed.data.status !== "approved" && step.status === "approved") data.approvedAt = null;
  }
  if (parsed.data.notes !== undefined) data.notes = parsed.data.notes;

  const updated = await prisma.designContractStep.update({
    where: { id: params.stepId },
    data,
  });

  // Auto: nếu cả 4 step approved → HĐ done
  const all = await prisma.designContractStep.findMany({ where: { contractId: params.id } });
  if (all.length === 4 && all.every((s) => s.status === "approved")) {
    await prisma.designContract.update({ where: { id: params.id }, data: { status: "done" } });
  } else {
    await prisma.designContract.update({ where: { id: params.id }, data: { status: "active" } });
  }

  return NextResponse.json({
    id: updated.id,
    kind: updated.kind,
    status: updated.status,
    approvedAt: updated.approvedAt?.toISOString() ?? null,
    notes: updated.notes,
  });
}
