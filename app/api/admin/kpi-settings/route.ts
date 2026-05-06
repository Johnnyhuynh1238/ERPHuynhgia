import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-helpers";
import { getActiveKpiSettings } from "@/lib/kpi";
import { prisma } from "@/lib/prisma";

const settingsSchema = z.object({
  weightTienDo: z.coerce.number().int().min(0).max(100),
  weightQc: z.coerce.number().int().min(0).max(100),
  weightBaoCao: z.coerce.number().int().min(0).max(100),
  weightChuNha: z.coerce.number().int().min(0).max(100),
  weightDongGop: z.coerce.number().int().min(0).max(100),
  effectiveFromMonth: z.string().trim().regex(/^\d{4}-\d{2}$/),
  reason: z.string().trim().min(1).max(2000),
});

function currentMonthString() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function isValidMonth(value: string) {
  const [year, month] = value.split("-").map(Number);
  return Number.isInteger(year) && Number.isInteger(month) && month >= 1 && month <= 12;
}

function weightTotal(input: z.infer<typeof settingsSchema>) {
  return input.weightTienDo + input.weightQc + input.weightBaoCao + input.weightChuNha + input.weightDongGop;
}

function serialize(row: Awaited<ReturnType<typeof prisma.kpiSettings.findFirst>>) {
  if (!row) return null;
  return {
    id: row.id,
    weightTienDo: row.weightTienDo,
    weightQc: row.weightQc,
    weightBaoCao: row.weightBaoCao,
    weightChuNha: row.weightChuNha,
    weightDongGop: row.weightDongGop,
    effectiveFromMonth: row.effectiveFromMonth,
    changedBy: row.changedBy,
    changedAt: row.changedAt.toISOString(),
    reason: row.reason,
  };
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user?.id || user.role !== UserRole.admin) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const month = searchParams.get("month") || currentMonthString();
  if (!/^\d{4}-\d{2}$/.test(month) || !isValidMonth(month)) {
    return NextResponse.json({ message: "month không hợp lệ, định dạng đúng: YYYY-MM" }, { status: 400 });
  }

  const [active, history] = await Promise.all([
    getActiveKpiSettings(month),
    prisma.kpiSettings.findMany({
      orderBy: { effectiveFromMonth: "desc" },
      take: 20,
      include: {
        changer: {
          select: { id: true, fullName: true, email: true },
        },
      },
    }),
  ]);

  return NextResponse.json({
    month,
    active,
    history: history.map((row) => ({
      ...serialize(row),
      changer: row.changer,
      isCurrent: row.effectiveFromMonth === active.effectiveFromMonth,
    })),
  });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user?.id || user.role !== UserRole.admin) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const payload = await request.json().catch(() => null);
  const parsed = settingsSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const data = parsed.data;
  if (!isValidMonth(data.effectiveFromMonth)) {
    return NextResponse.json({ message: "Tháng hiệu lực không hợp lệ" }, { status: 400 });
  }

  if (weightTotal(data) !== 100) {
    return NextResponse.json({ message: "Tổng trọng số phải bằng 100%" }, { status: 400 });
  }

  if (data.effectiveFromMonth < currentMonthString()) {
    return NextResponse.json({ message: "Tháng hiệu lực phải từ tháng hiện tại trở đi" }, { status: 400 });
  }

  const saved = await prisma.kpiSettings.upsert({
    where: { effectiveFromMonth: data.effectiveFromMonth },
    create: {
      weightTienDo: data.weightTienDo,
      weightQc: data.weightQc,
      weightBaoCao: data.weightBaoCao,
      weightChuNha: data.weightChuNha,
      weightDongGop: data.weightDongGop,
      effectiveFromMonth: data.effectiveFromMonth,
      changedBy: user.id,
      reason: data.reason,
    },
    update: {
      weightTienDo: data.weightTienDo,
      weightQc: data.weightQc,
      weightBaoCao: data.weightBaoCao,
      weightChuNha: data.weightChuNha,
      weightDongGop: data.weightDongGop,
      changedBy: user.id,
      changedAt: new Date(),
      reason: data.reason,
    },
    include: {
      changer: {
        select: { id: true, fullName: true, email: true },
      },
    },
  });

  return NextResponse.json({
    message: "Đã lưu cấu hình KPI",
    setting: {
      ...serialize(saved),
      changer: saved.changer,
    },
  });
}
