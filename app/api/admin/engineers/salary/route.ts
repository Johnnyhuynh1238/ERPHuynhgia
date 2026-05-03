import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { calculateSalary, toNumber } from "@/lib/kpi-salary";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const actor = await getCurrentUser();
  if (!actor?.id || actor.role !== UserRole.admin) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const search = (searchParams.get("search") || "").trim();

  const engineers = await prisma.user.findMany({
    where: {
      role: UserRole.engineer,
      isActive: true,
      ...(search
        ? {
            OR: [
              { fullName: { contains: search, mode: "insensitive" } },
              { email: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      fullName: true,
      email: true,
      engineerSalaryConfig: {
        select: {
          id: true,
          salaryMax: true,
          effectiveFrom: true,
          isActive: true,
          updatedAt: true,
        },
      },
    },
    orderBy: { fullName: "asc" },
  });

  const rows = engineers.map((engineer) => {
    const config = engineer.engineerSalaryConfig;
    if (!config || !config.isActive) {
      return {
        id: engineer.id,
        fullName: engineer.fullName,
        email: engineer.email,
        config: null,
      };
    }

    const salary = calculateSalary(toNumber(config.salaryMax), 100);

    return {
      id: engineer.id,
      fullName: engineer.fullName,
      email: engineer.email,
      config: {
        id: config.id,
        salaryMax: toNumber(config.salaryMax),
        baseSalary: salary.baseSalary,
        bonusMax: salary.bonusMax,
        effectiveFrom: config.effectiveFrom.toISOString().slice(0, 10),
        updatedAt: config.updatedAt.toISOString(),
      },
    };
  });

  const totals = rows.reduce(
    (acc, row) => {
      if (!row.config) return acc;
      acc.countConfigured += 1;
      acc.totalBaseSalary += row.config.baseSalary;
      acc.totalBonusMax += row.config.bonusMax;
      acc.totalSalaryMax += row.config.salaryMax;
      return acc;
    },
    {
      countConfigured: 0,
      totalBaseSalary: 0,
      totalBonusMax: 0,
      totalSalaryMax: 0,
    },
  );

  return NextResponse.json({
    totals: {
      engineerCount: rows.length,
      countConfigured: totals.countConfigured,
      totalBaseSalary: Number(totals.totalBaseSalary.toFixed(2)),
      totalBonusMax: Number(totals.totalBonusMax.toFixed(2)),
      totalSalaryMax: Number(totals.totalSalaryMax.toFixed(2)),
    },
    rows,
  });
}
