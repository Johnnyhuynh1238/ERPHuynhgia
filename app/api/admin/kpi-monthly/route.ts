import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-helpers";
import { toNumber } from "@/lib/kpi-salary";
import { prisma } from "@/lib/prisma";

const querySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  status: z.enum(["draft", "pending", "finalized"]).optional(),
});

export async function GET(request: Request) {
  const actor = await getCurrentUser();
  if (!actor?.id || actor.role !== UserRole.admin) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    year: searchParams.get("year"),
    month: searchParams.get("month"),
    status: searchParams.get("status") || undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "year/month không hợp lệ" }, { status: 400 });
  }

  const rows = await prisma.engineerKpiMonthly.findMany({
    where: {
      year: parsed.data.year,
      month: parsed.data.month,
      ...(parsed.data.status ? { status: parsed.data.status } : {}),
    },
    include: {
      user: {
        select: {
          id: true,
          fullName: true,
          email: true,
        },
      },
    },
    orderBy: [{ totalScore: "desc" }, { user: { fullName: "asc" } }],
  });

  const totals = rows.reduce(
    (acc, row) => {
      acc.totalBaseSalary += toNumber(row.baseSalary);
      acc.totalBonusAmount += toNumber(row.bonusAmount);
      acc.totalSalary += toNumber(row.totalSalary);
      return acc;
    },
    {
      totalBaseSalary: 0,
      totalBonusAmount: 0,
      totalSalary: 0,
    },
  );

  return NextResponse.json({
    year: parsed.data.year,
    month: parsed.data.month,
    statusFilter: parsed.data.status ?? null,
    totals: {
      totalBaseSalary: Number(totals.totalBaseSalary.toFixed(2)),
      totalBonusAmount: Number(totals.totalBonusAmount.toFixed(2)),
      totalSalary: Number(totals.totalSalary.toFixed(2)),
    },
    rows: rows.map((row) => ({
      id: row.id,
      userId: row.userId,
      userName: row.user.fullName,
      email: row.user.email,
      status: row.status,
      scoreSchedule: toNumber(row.scoreSchedule),
      scoreQc: toNumber(row.scoreQc),
      scoreReport: toNumber(row.scoreReport),
      scoreCustomer: toNumber(row.scoreCustomer),
      scoreContribution: toNumber(row.scoreContribution),
      totalScore: toNumber(row.totalScore),
      salaryMax: toNumber(row.salaryMax),
      baseSalary: toNumber(row.baseSalary),
      bonusMax: toNumber(row.bonusMax),
      bonusRatio: toNumber(row.bonusRatio),
      bonusAmount: toNumber(row.bonusAmount),
      totalSalary: toNumber(row.totalSalary),
      finalizedAt: row.finalizedAt?.toISOString() ?? null,
      finalizedBy: row.finalizedBy,
      updatedAt: row.updatedAt.toISOString(),
    })),
  });
}
