import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-helpers";
import { getActiveKpiSettings } from "@/lib/kpi";
import { calculateSalary, calculateTotalScore, asPrismaDecimal, toNumber } from "@/lib/kpi-salary";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({
  score: z.coerce.number().min(0).max(100),
  note: z.string().trim().max(2000).optional().nullable(),
});

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const actor = await getCurrentUser();
  if (!actor?.id || !actor.role) {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }

  if (actor.role !== UserRole.admin && actor.role !== UserRole.construction_manager) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const payload = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const existed = await prisma.engineerKpiMonthly.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      status: true,
      year: true,
      month: true,
      scoreSchedule: true,
      scoreQc: true,
      scoreReport: true,
      scoreCustomer: true,
      salaryMax: true,
    },
  });

  if (!existed) {
    return NextResponse.json({ message: "Không tìm thấy kỳ KPI tháng" }, { status: 404 });
  }

  if (existed.status === "finalized") {
    return NextResponse.json({ message: "Kỳ KPI tháng đã chốt, không thể sửa" }, { status: 400 });
  }

  const settings = await getActiveKpiSettings(`${existed.year}-${String(existed.month).padStart(2, "0")}`);
  const totalScore = calculateTotalScore(
    {
      schedule: toNumber(existed.scoreSchedule),
      qc: toNumber(existed.scoreQc),
      report: toNumber(existed.scoreReport),
      customer: toNumber(existed.scoreCustomer),
      contribution: parsed.data.score,
    },
    settings,
  );

  const salary = calculateSalary(toNumber(existed.salaryMax), totalScore);

  const updated = await prisma.engineerKpiMonthly.update({
    where: { id: params.id },
    data: {
      scoreContribution: asPrismaDecimal(parsed.data.score),
      contributionNote: parsed.data.note || null,
      contributionBy: actor.id,
      contributionAt: new Date(),
      totalScore: asPrismaDecimal(totalScore),
      bonusRatio: asPrismaDecimal(salary.bonusRatio),
      bonusAmount: asPrismaDecimal(salary.bonusAmount),
      totalSalary: asPrismaDecimal(salary.totalSalary),
    },
    select: {
      id: true,
      status: true,
      scoreContribution: true,
      contributionAt: true,
      totalScore: true,
      bonusRatio: true,
      bonusAmount: true,
      totalSalary: true,
    },
  });

  if (actor.role === UserRole.construction_manager) {
    return NextResponse.json({
      message: "Đã chấm điểm Đóng góp",
      record: {
        id: updated.id,
        status: updated.status,
        scoreContribution: toNumber(updated.scoreContribution),
        contributionAt: updated.contributionAt?.toISOString() ?? null,
      },
    });
  }

  return NextResponse.json({
    message: "Đã cập nhật điểm Đóng góp",
    record: {
      id: updated.id,
      status: updated.status,
      scoreContribution: toNumber(updated.scoreContribution),
      totalScore: toNumber(updated.totalScore),
      bonusRatio: toNumber(updated.bonusRatio),
      bonusAmount: toNumber(updated.bonusAmount),
      totalSalary: toNumber(updated.totalSalary),
      contributionAt: updated.contributionAt?.toISOString() ?? null,
    },
  });
}
