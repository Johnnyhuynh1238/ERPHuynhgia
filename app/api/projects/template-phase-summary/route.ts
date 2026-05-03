import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-helpers";

function mapAuthError(error: unknown) {
  const message = error instanceof Error ? error.message : "UNKNOWN";
  if (message === "401_UNAUTHORIZED") {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }
  if (message === "403_FORBIDDEN") {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }
  return null;
}

export async function GET(request: Request) {
  try {
    await requireRole(["admin", "construction_manager"]);
  } catch (error) {
    return mapAuthError(error) || NextResponse.json({ message: "Lỗi xác thực" }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const templateCategory = (searchParams.get("templateCategory") || "nha_pho_1t1l").trim();

  const templates = await prisma.taskTemplate.findMany({
    where: {
      templateCategory,
      isActive: true,
    },
    select: {
      phaseCode: true,
      phaseName: true,
      phaseOrder: true,
      phaseDuration: true,
      defaultDurationDays: true,
    },
    orderBy: [{ phaseOrder: "asc" }, { phaseCode: "asc" }],
  });

  const phaseMap = new Map<string, { code: string; name: string; order: number; duration: number }>();

  for (const template of templates) {
    if (!template.phaseCode || !template.phaseName || !template.phaseOrder) continue;
    const duration = Math.max(1, Number(template.phaseDuration || template.defaultDurationDays || 1));
    const current = phaseMap.get(template.phaseCode);

    if (!current) {
      phaseMap.set(template.phaseCode, {
        code: template.phaseCode,
        name: template.phaseName,
        order: template.phaseOrder,
        duration,
      });
      continue;
    }

    if (duration > current.duration) {
      current.duration = duration;
    }
  }

  const phases = Array.from(phaseMap.values()).sort((a, b) => a.order - b.order);
  const totalDuration = phases.reduce((sum, phase) => sum + phase.duration, 0);

  return NextResponse.json({
    templateCategory,
    phases,
    totalDuration,
  });
}
