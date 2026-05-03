import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-helpers";
import { toNumber } from "@/lib/kpi-salary";
import { prisma } from "@/lib/prisma";

const querySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
});

export async function GET(request: Request) {
  const actor = await getCurrentUser();
  if (!actor?.id || !actor.role) {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }

  if (actor.role !== UserRole.construction_manager && actor.role !== UserRole.admin) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    year: searchParams.get("year") || undefined,
    month: searchParams.get("month") || undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "year/month không hợp lệ" }, { status: 400 });
  }

  const now = new Date();
  const year = parsed.data.year ?? now.getUTCFullYear();
  const month = parsed.data.month ?? now.getUTCMonth() + 1;

  const rows = await prisma.engineerKpiMonthly.findMany({
    where: {
      year,
      month,
      status: { in: ["draft", "pending"] },
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
    orderBy: [{ status: "asc" }, { user: { fullName: "asc" } }],
  });

  return NextResponse.json({
    year,
    month,
    rows: rows.map((row) => ({
      id: row.id,
      userId: row.userId,
      userName: row.user.fullName,
      email: row.user.email,
      status: row.status,
      scoreContribution: toNumber(row.scoreContribution),
      contributionNote: row.contributionNote,
      contributionBy: row.contributionBy,
      contributionAt: row.contributionAt?.toISOString() ?? null,
      // Không trả các trường lương để tránh lộ thu nhập.
    })),
  });
}
