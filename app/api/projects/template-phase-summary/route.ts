import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-helpers";
import { getPhaseMeta } from "@/lib/task-template-csv";

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
  const templateCategory = (searchParams.get("templateCategory") || "standard_catalog").trim();

  if (templateCategory === "standard_catalog") {
    const catalog = await prisma.standardTaskCatalog.findMany({
      where: { retiredAt: null },
      select: { phaseCode: true, phaseName: true, defaultDurationDays: true },
      orderBy: [{ phaseCode: "asc" }, { displayOrder: "asc" }],
    });
    const phaseMap = new Map<string, { code: string; name: string; order: number; duration: number }>();
    for (const row of catalog) {
      const order = parseInt(row.phaseCode, 10) || 0;
      const dur = Math.max(1, row.defaultDurationDays ?? 1);
      const existing = phaseMap.get(row.phaseCode);
      if (!existing) {
        phaseMap.set(row.phaseCode, { code: row.phaseCode, name: row.phaseName, order, duration: dur });
      } else if (dur > existing.duration) {
        existing.duration = dur;
      }
    }
    const phases = Array.from(phaseMap.values()).sort((a, b) => a.order - b.order);
    return NextResponse.json({
      templateCategory,
      phases,
      totalDuration: phases.reduce((sum, p) => sum + p.duration, 0),
    });
  }

  const templates = await prisma.taskTemplate.findMany({
    where: {
      templateCategory,
      isActive: true,
    },
    select: {
      phase: true,
      phaseCode: true,
      phaseName: true,
      phaseOrder: true,
      phaseDuration: true,
      defaultDurationDays: true,
      duration: true,
    },
    orderBy: [{ phaseOrder: "asc" }, { phaseCode: "asc" }],
  });

  const phaseMap = new Map<string, { code: string; name: string; order: number; duration: number }>();

  for (const template of templates) {
    const fallback = getPhaseMeta(template.phase);
    const phaseCode = template.phaseCode || fallback.code;
    const phaseName = template.phaseName || fallback.name;
    const phaseOrder = template.phaseOrder || fallback.order;
    const duration = Math.max(1, Number(template.phaseDuration || template.duration || template.defaultDurationDays || 1));
    const current = phaseMap.get(phaseCode);

    if (!current) {
      phaseMap.set(phaseCode, {
        code: phaseCode,
        name: phaseName,
        order: phaseOrder,
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
