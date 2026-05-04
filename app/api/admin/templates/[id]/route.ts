import { NextResponse } from "next/server";
import { TaskCategory, TaskPhase } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-helpers";
import { getPhaseMeta } from "@/lib/task-template-csv";

const DEFAULT_TEMPLATE_CATEGORY = "nha_pho_1t1l";

const PHASE_BY_CODE: Record<string, TaskPhase> = {
  P1: TaskPhase.P1_CHUAN_BI,
  P2: TaskPhase.P2_MONG,
  P3: TaskPhase.P3_KHUNG_TRET,
  P4: TaskPhase.P4_KHUNG_LAU,
  P5: TaskPhase.P5_ME_XAY_TO,
  P6: TaskPhase.P6_OP_LAT,
  P7: TaskPhase.P7_SON_BA,
  P8: TaskPhase.P8_LAP_TB,
  P9: TaskPhase.P9_BAN_GIAO,
};

const baseFieldsSchema = {
  code: z.string().trim().min(1),
  name: z.string().trim().min(1),
  displayOrder: z.number().int().min(1),
  templateCategory: z.string().trim().min(1).default(DEFAULT_TEMPLATE_CATEGORY),
  category: z.nativeEnum(TaskCategory).default(TaskCategory.normal),
  duration: z.number().int().min(1).optional(),
  description: z.string().trim().optional().nullable(),
  isActive: z.boolean().optional(),
};

const modernTemplateSchema = z.object({
  ...baseFieldsSchema,
  phaseCode: z.string().trim().min(1),
  phaseName: z.string().trim().optional(),
  phaseOrder: z.number().int().min(1).optional(),
  defaultOffsetDays: z.number().int().optional(),
  defaultDurationDays: z.number().int().min(1).optional(),
  defaultTeam: z.string().trim().optional(),
  defaultInspector: z.string().trim().optional(),
  materialsNeeded: z.string().optional(),
  proposerRole: z.string().trim().optional(),
  ordererRole: z.string().trim().optional(),
  receiverRole: z.string().trim().optional(),
  qcChecklist: z.string().optional(),
  isMilestone: z.boolean().optional(),
});

const legacyTemplateSchema = z.object({
  ...baseFieldsSchema,
  phase: z.nativeEnum(TaskPhase),
  defaultOffsetDays: z.number().int(),
  defaultDurationDays: z.number().int().min(1),
  defaultTeam: z.string().trim().min(1),
  defaultInspector: z.string().trim().min(1),
  materialsNeeded: z.string().trim().min(1),
  proposerRole: z.string().trim().min(1),
  ordererRole: z.string().trim().min(1),
  receiverRole: z.string().trim().min(1),
  qcChecklist: z.string().trim().min(1),
  isMilestone: z.boolean(),
});

const deleteSchema = z.object({
  confirmCode: z.string().trim().optional(),
});

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

function phaseFromCode(phaseCode: string) {
  const normalized = phaseCode.trim().toUpperCase();
  const phase = PHASE_BY_CODE[normalized];
  if (!phase) {
    throw new Error("Phase code không hợp lệ");
  }
  return phase;
}

function normalizeText(value: string | undefined | null, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function resolveTemplatePayload(input: unknown) {
  const modern = modernTemplateSchema.safeParse(input);
  if (modern.success) {
    const data = modern.data;
    const phase = phaseFromCode(data.phaseCode);
    const phaseMeta = getPhaseMeta(phase);
    const duration = data.duration ?? data.defaultDurationDays ?? 1;

    return {
      code: data.code,
      name: data.name,
      phase,
      phaseCode: data.phaseCode.trim().toUpperCase(),
      phaseName: data.phaseName?.trim() || phaseMeta.name,
      phaseOrder: data.phaseOrder ?? phaseMeta.order,
      phaseDuration: duration,
      defaultOffsetDays: data.defaultOffsetDays ?? 0,
      defaultDurationDays: data.defaultDurationDays ?? duration,
      duration,
      defaultTeam: normalizeText(data.defaultTeam),
      defaultInspector: normalizeText(data.defaultInspector),
      materialsNeeded: normalizeText(data.materialsNeeded, data.description ?? ""),
      proposerRole: normalizeText(data.proposerRole),
      ordererRole: normalizeText(data.ordererRole),
      receiverRole: normalizeText(data.receiverRole),
      qcChecklist: normalizeText(data.qcChecklist),
      isMilestone: data.isMilestone ?? data.category !== TaskCategory.normal,
      displayOrder: data.displayOrder,
      templateCategory: data.templateCategory,
      category: data.category,
      ...(typeof data.isActive === "boolean" ? { isActive: data.isActive } : {}),
    };
  }

  const legacy = legacyTemplateSchema.safeParse(input);
  if (legacy.success) {
    const data = legacy.data;
    const phaseMeta = getPhaseMeta(data.phase);

    return {
      code: data.code,
      name: data.name,
      phase: data.phase,
      phaseCode: phaseMeta.code,
      phaseName: phaseMeta.name,
      phaseOrder: phaseMeta.order,
      phaseDuration: data.defaultDurationDays,
      defaultOffsetDays: data.defaultOffsetDays,
      defaultDurationDays: data.defaultDurationDays,
      duration: data.duration ?? data.defaultDurationDays,
      defaultTeam: data.defaultTeam,
      defaultInspector: data.defaultInspector,
      materialsNeeded: data.materialsNeeded,
      proposerRole: data.proposerRole,
      ordererRole: data.ordererRole,
      receiverRole: data.receiverRole,
      qcChecklist: data.qcChecklist,
      isMilestone: data.isMilestone,
      displayOrder: data.displayOrder,
      templateCategory: data.templateCategory,
      category: data.category,
      ...(typeof data.isActive === "boolean" ? { isActive: data.isActive } : {}),
    };
  }

  const issue = modern.error?.issues[0]?.message || legacy.error?.issues[0]?.message || "Dữ liệu không hợp lệ";
  throw new Error(issue);
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    await requireRole(["admin"]);
  } catch (error) {
    return mapAuthError(error) || NextResponse.json({ message: "Lỗi xác thực" }, { status: 500 });
  }

  const template = await prisma.taskTemplate.findUnique({
    where: { id: params.id },
    include: {
      qcTemplate: {
        include: {
          qcItems: {
            orderBy: { displayOrder: "asc" },
          },
        },
      },
      _count: {
        select: {
          tasks: true,
        },
      },
    },
  });

  if (!template) {
    return NextResponse.json({ message: "Không tìm thấy template" }, { status: 404 });
  }

  return NextResponse.json({ template });
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireRole(["admin"]);
  } catch (error) {
    return mapAuthError(error) || NextResponse.json({ message: "Lỗi xác thực" }, { status: 500 });
  }

  const existing = await prisma.taskTemplate.findUnique({
    where: { id: params.id },
    select: { id: true, templateCategory: true },
  });

  if (!existing) {
    return NextResponse.json({ message: "Không tìm thấy template" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);

  let payload;
  try {
    payload = resolveTemplatePayload(body);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Dữ liệu không hợp lệ";
    return NextResponse.json({ message }, { status: 400 });
  }

  const duplicated = await prisma.taskTemplate.findFirst({
    where: {
      id: { not: params.id },
      code: payload.code,
      templateCategory: payload.templateCategory,
    },
    select: { id: true },
  });

  if (duplicated) {
    return NextResponse.json({ message: "Mã template đã tồn tại trong category" }, { status: 400 });
  }

  const updated = await prisma.taskTemplate.update({
    where: { id: params.id },
    data: payload,
    include: {
      qcTemplate: {
        include: {
          qcItems: {
            orderBy: { displayOrder: "asc" },
          },
        },
      },
    },
  });

  return NextResponse.json({ template: updated, message: "Đã cập nhật template" });
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireRole(["admin"]);
  } catch (error) {
    return mapAuthError(error) || NextResponse.json({ message: "Lỗi xác thực" }, { status: 500 });
  }

  const template = await prisma.taskTemplate.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      code: true,
      isActive: true,
      _count: {
        select: {
          tasks: true,
        },
      },
    },
  });

  if (!template) {
    return NextResponse.json({ message: "Không tìm thấy template" }, { status: 404 });
  }

  if (!template.isActive) {
    return NextResponse.json({ message: "Template đã bị xóa mềm trước đó" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  if (parsed.data.confirmCode && parsed.data.confirmCode !== template.code) {
    return NextResponse.json({ message: "Mã xác nhận không khớp" }, { status: 400 });
  }

  const projectsUsingTemplate = await prisma.project.findMany({
    where: {
      tasks: {
        some: {
          templateId: template.id,
        },
      },
    },
    select: {
      id: true,
      code: true,
      name: true,
      status: true,
    },
    orderBy: { code: "asc" },
    take: 20,
  });

  await prisma.$transaction(async (tx) => {
    await tx.task.updateMany({
      where: { templateId: template.id },
      data: { templateId: null },
    });

    await tx.taskTemplate.update({
      where: { id: template.id },
      data: { isActive: false },
    });
  });

  return NextResponse.json({
    message: "Đã xóa template (soft delete)",
    detachedTaskCount: template._count.tasks,
    affectedProjects: projectsUsingTemplate,
  });
}
