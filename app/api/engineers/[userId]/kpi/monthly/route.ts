import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-helpers";
import { toNumber } from "@/lib/kpi-salary";
import { prisma } from "@/lib/prisma";

const querySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});

function canReadMonthly(viewer: { id?: string | null; role?: string | null } | null, userId: string) {
  if (!viewer?.id || !viewer.role) return false;
  if (viewer.role === UserRole.admin) return true;
  return viewer.id === userId;
}

export async function GET(request: Request, { params }: { params: { userId: string } }) {
  const viewer = await getCurrentUser();
  if (!viewer?.id || !viewer.role) {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }

  if (!canReadMonthly(viewer, params.userId)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    year: searchParams.get("year"),
    month: searchParams.get("month"),
  });

  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "year/month không hợp lệ" }, { status: 400 });
  }

  const record = await prisma.engineerKpiMonthly.findUnique({
    where: {
      userId_year_month: {
        userId: params.userId,
        year: parsed.data.year,
        month: parsed.data.month,
      },
    },
    include: {
      user: {
        select: {
          id: true,
          fullName: true,
        },
      },
    },
  });

  if (!record) {
    return NextResponse.json({ record: null });
  }

  return NextResponse.json({
    record: {
      id: record.id,
      userId: record.userId,
      userName: record.user.fullName,
      year: record.year,
      month: record.month,
      scoreSchedule: toNumber(record.scoreSchedule),
      scoreQc: toNumber(record.scoreQc),
      scoreReport: toNumber(record.scoreReport),
      scoreCustomer: toNumber(record.scoreCustomer),
      scoreContribution: toNumber(record.scoreContribution),
      totalScore: toNumber(record.totalScore),
      salaryMax: toNumber(record.salaryMax),
      baseSalary: toNumber(record.baseSalary),
      bonusMax: toNumber(record.bonusMax),
      bonusRatio: toNumber(record.bonusRatio),
      bonusAmount: toNumber(record.bonusAmount),
      totalSalary: toNumber(record.totalSalary),
      contributionNote: record.contributionNote,
      contributionBy: record.contributionBy,
      contributionAt: record.contributionAt?.toISOString() ?? null,
      status: record.status,
      finalizedAt: record.finalizedAt?.toISOString() ?? null,
      finalizedBy: record.finalizedBy,
      scheduleDetails: record.scheduleDetails,
      qcDetails: record.qcDetails,
      reportDetails: record.reportDetails,
      customerDetails: record.customerDetails,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    },
  });
}
