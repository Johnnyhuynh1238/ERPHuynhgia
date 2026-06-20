import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-helpers";

function mapAuthError(error: unknown) {
  const message = error instanceof Error ? error.message : "UNKNOWN";
  if (message === "401_UNAUTHORIZED") return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (message === "403_FORBIDDEN") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  return null;
}

// status nào cho phép sync field (catalog → task). Khác = locked, chỉ map.
const SYNCABLE_STATUSES = new Set(["not_started"]);

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    await requireRole(["admin", "construction_manager"]);
  } catch (error) {
    return mapAuthError(error) || NextResponse.json({ message: "Lỗi xác thực" }, { status: 500 });
  }

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    select: { id: true, name: true, code: true },
  });
  if (!project) return NextResponse.json({ message: "Không tìm thấy dự án" }, { status: 404 });

  const [tasks, phases, catalog] = await Promise.all([
    prisma.task.findMany({
      where: { projectId: params.id, isActive: true },
      select: {
        id: true,
        code: true,
        name: true,
        phase: true,
        status: true,
        team: true,
        inspectorName: true,
        displayOrder: true,
        stdPhaseCode: true,
        stdTaskCode: true,
        stdCatalogId: true,
        projectPhase: { select: { id: true, code: true, name: true, displayOrder: true } },
      },
      orderBy: [{ displayOrder: "asc" }, { code: "asc" }],
    }),
    prisma.projectPhase.findMany({
      where: { projectId: params.id },
      select: { id: true, code: true, name: true, displayOrder: true, status: true },
      orderBy: { displayOrder: "asc" },
    }),
    prisma.standardTaskCatalog.findMany({
      where: { retiredAt: null },
      orderBy: [{ phaseCode: "asc" }, { displayOrder: "asc" }],
    }),
  ]);

  return NextResponse.json({ project, tasks, phases, catalog, syncableStatuses: Array.from(SYNCABLE_STATUSES) });
}

const mappingSchema = z.object({
  taskId: z.string().uuid(),
  stdCatalogId: z.string().uuid().nullable(),
  syncFields: z.boolean().default(false),
});

const phaseRenameSchema = z.object({
  phaseId: z.string().uuid(),
  newCode: z.string().min(1),
  newName: z.string().min(1),
});

const postSchema = z.object({
  mappings: z.array(mappingSchema).default([]),
  phaseRenames: z.array(phaseRenameSchema).default([]),
});

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireRole(["admin", "construction_manager"]);
  } catch (error) {
    return mapAuthError(error) || NextResponse.json({ message: "Lỗi xác thực" }, { status: 500 });
  }

  const body = await request.json().catch(() => null);
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const catalogIds = parsed.data.mappings.map((m) => m.stdCatalogId).filter((id): id is string => !!id);
  const catalogRows = catalogIds.length
    ? await prisma.standardTaskCatalog.findMany({ where: { id: { in: catalogIds } } })
    : [];
  const catalogById = new Map(catalogRows.map((row) => [row.id, row]));

  const taskIds = parsed.data.mappings.map((m) => m.taskId);
  const tasks = taskIds.length
    ? await prisma.task.findMany({
        where: { id: { in: taskIds }, projectId: params.id },
        select: { id: true, status: true, code: true },
      })
    : [];
  const taskById = new Map(tasks.map((task) => [task.id, task]));

  let mappedCount = 0;
  let syncedCount = 0;
  let skippedLocked = 0;
  let skippedMissing = 0;

  await prisma.$transaction(async (tx) => {
    for (const mapping of parsed.data.mappings) {
      const task = taskById.get(mapping.taskId);
      if (!task) {
        skippedMissing += 1;
        continue;
      }

      const catalog = mapping.stdCatalogId ? catalogById.get(mapping.stdCatalogId) : null;

      const data: Record<string, unknown> = {
        stdCatalogId: catalog?.id ?? null,
        stdPhaseCode: catalog?.phaseCode ?? null,
        stdTaskCode: catalog?.taskCode ?? null,
      };

      if (mapping.syncFields && catalog) {
        if (!SYNCABLE_STATUSES.has(task.status)) {
          // locked task — chỉ map, không sync field
          skippedLocked += 1;
        } else {
          data.name = catalog.taskName;
          if (catalog.defaultTeam !== null) data.team = catalog.defaultTeam;
          if (catalog.defaultInspector !== null) data.inspectorName = catalog.defaultInspector;
          if (catalog.materialsNeeded !== null) data.materialsNeeded = catalog.materialsNeeded;
          if (catalog.proposerRole !== null) data.proposerRole = catalog.proposerRole;
          if (catalog.ordererRole !== null) data.ordererRole = catalog.ordererRole;
          if (catalog.receiverRole !== null) data.receiverRole = catalog.receiverRole;
          if (catalog.qcChecklist !== null) data.qcChecklist = catalog.qcChecklist;
          data.isMilestone = catalog.isMilestone;
          data.category = catalog.category;
          if (catalog.defaultDurationDays !== null) {
            data.durationDays = catalog.defaultDurationDays;
            data.duration = catalog.defaultDurationDays;
          }
          data.displayOrder = catalog.displayOrder;
          syncedCount += 1;
        }
      }

      await tx.task.update({ where: { id: task.id }, data });
      mappedCount += 1;
    }

    for (const rename of parsed.data.phaseRenames) {
      const phase = await tx.projectPhase.findFirst({
        where: { id: rename.phaseId, projectId: params.id },
        select: { id: true, status: true },
      });
      if (!phase) continue;
      if (phase.status !== "not_started") continue;
      await tx.projectPhase.update({
        where: { id: phase.id },
        data: { code: rename.newCode, name: rename.newName },
      });
    }
  });

  return NextResponse.json({
    message: "Đã cập nhật",
    mappedCount,
    syncedCount,
    skippedLocked,
    skippedMissing,
  });
}
