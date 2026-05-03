import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-helpers";
import { calculateSalary, asPrismaDecimal, toNumber } from "@/lib/kpi-salary";
import { prisma } from "@/lib/prisma";

const payloadSchema = z.object({
  salaryMax: z.coerce.number().positive("Lương max phải lớn hơn 0"),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "effectiveFrom phải có định dạng YYYY-MM-DD"),
  changeReason: z.string().trim().max(1000).optional().nullable(),
});

function canReadSalary(viewer: { id?: string | null; role?: string | null } | null, userId: string) {
  if (!viewer?.id || !viewer.role) return false;
  if (viewer.role === UserRole.admin) return true;
  return viewer.id === userId;
}

function parseYmdToDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

export async function GET(_request: Request, { params }: { params: { userId: string } }) {
  const viewer = await getCurrentUser();
  if (!viewer?.id || !viewer.role) {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }

  if (!canReadSalary(viewer, params.userId)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const config = await prisma.engineerSalaryConfig.findUnique({
    where: { userId: params.userId },
    include: {
      user: {
        select: {
          id: true,
          fullName: true,
          role: true,
        },
      },
    },
  });

  if (!config) {
    return NextResponse.json({ config: null });
  }

  const salary = calculateSalary(toNumber(config.salaryMax), 100);

  return NextResponse.json({
    config: {
      id: config.id,
      userId: config.userId,
      userName: config.user.fullName,
      salaryMax: toNumber(config.salaryMax),
      baseSalary: salary.baseSalary,
      bonusMax: salary.bonusMax,
      effectiveFrom: config.effectiveFrom.toISOString().slice(0, 10),
      isActive: config.isActive,
      updatedAt: config.updatedAt.toISOString(),
    },
  });
}

export async function POST(request: Request, { params }: { params: { userId: string } }) {
  const actor = await getCurrentUser();
  if (!actor?.id || actor.role !== UserRole.admin) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: params.userId },
    select: { id: true, role: true, fullName: true },
  });

  if (!targetUser || targetUser.role !== UserRole.engineer) {
    return NextResponse.json({ message: "Chỉ cấu hình lương cho kỹ sư" }, { status: 400 });
  }

  const salaryMax = asPrismaDecimal(parsed.data.salaryMax);
  const effectiveFrom = parseYmdToDate(parsed.data.effectiveFrom);

  const result = await prisma.$transaction(async (tx) => {
    const existed = await tx.engineerSalaryConfig.findUnique({ where: { userId: params.userId } });

    if (existed) {
      const updated = await tx.engineerSalaryConfig.update({
        where: { userId: params.userId },
        data: {
          salaryMax,
          effectiveFrom,
          updatedBy: actor.id,
          isActive: true,
        },
      });

      await tx.engineerSalaryHistory.create({
        data: {
          configId: existed.id,
          salaryMax,
          effectiveFrom,
          changeReason: parsed.data.changeReason || null,
          changedBy: actor.id,
        },
      });

      return updated;
    }

    const created = await tx.engineerSalaryConfig.create({
      data: {
        userId: params.userId,
        salaryMax,
        effectiveFrom,
        updatedBy: actor.id,
      },
    });

    await tx.engineerSalaryHistory.create({
      data: {
        configId: created.id,
        salaryMax,
        effectiveFrom,
        changeReason: parsed.data.changeReason || "Khởi tạo lương max",
        changedBy: actor.id,
      },
    });

    return created;
  });

  const salary = calculateSalary(toNumber(result.salaryMax), 100);

  return NextResponse.json({
    message: "Đã lưu cấu hình lương",
    config: {
      id: result.id,
      userId: result.userId,
      salaryMax: toNumber(result.salaryMax),
      baseSalary: salary.baseSalary,
      bonusMax: salary.bonusMax,
      effectiveFrom: result.effectiveFrom.toISOString().slice(0, 10),
      isActive: result.isActive,
      updatedAt: result.updatedAt.toISOString(),
    },
  });
}

export const PATCH = POST;
