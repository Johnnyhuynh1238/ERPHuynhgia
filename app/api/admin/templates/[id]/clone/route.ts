import { NextResponse } from "next/server";
import { TaskCategory, TaskPhase } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-helpers";
import { getPhaseMeta } from "@/lib/task-template-csv";

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

const cloneSchema = z.object({
  code: z.string().trim().min(1),
  name: z.string().trim().min(1),
  phase: z.nativeEnum(TaskPhase).optional(),
  phaseCode: z.string().trim().optional(),
  phaseName: z.string().trim().optional(),
  phaseOrder: z.number().int().min(1).optional(),
  displayOrder: z.number().int().min(1).optional(),
  templateCategory: z.string().trim().min(1).optional(),
  category: z.nativeEnum(TaskCategory).optional(),
  duration: z.number().int().min(1).optional(),
  defaultOffsetDays: z.number().int().optional(),
  defaultDurationDays: z.number().int().min(1).optional(),
  isMilestone: z.boolean().optional(),
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

export async function POST(request: Request, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireRole(["admin"]);
  } catch (error) {
    return mapAuthError(error) || NextResponse.json({ message: "Lỗi xác thực" }, { status: 500 });
  }

  const source = await prisma.taskTemplate.findUnique({
    where: { id: params.id },
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

  if (!source) {
    return NextResponse.json({ message: "Không tìm thấy template nguồn" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = cloneSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const payload = parsed.data;
  let phase = source.phase;
  if (payload.phaseCode) {
    try {
      phase = phaseFromCode(payload.phaseCode);
    } catch (error) {
      return NextResponse.json({ message: error instanceof Error ? error.message : "Phase không hợp lệ" }, { status: 400 });
    }
  } else if (payload.phase) {
    phase = payload.phase;
  }

  const phaseMeta = getPhaseMeta(phase);
  const duration = payload.duration ?? payload.defaultDurationDays ?? source.duration ?? source.defaultDurationDays;
  const templateCategory = payload.templateCategory ?? source.templateCategory;

  const duplicated = await prisma.taskTemplate.findFirst({
    where: {
      code: payload.code,
      templateCategory,
    },
    select: { id: true },
  });

  if (duplicated) {
    return NextResponse.json({ message: "Mã template mới đã tồn tại trong category" }, { status: 400 });
  }

  const cloned = await prisma.$transaction(async (tx) => {
    const createdTemplate = await tx.taskTemplate.create({
      data: {
        code: payload.code,
        name: payload.name,
        phase,
        phaseCode: payload.phaseCode?.trim().toUpperCase() || phaseMeta.code,
        phaseName: payload.phaseName?.trim() || phaseMeta.name,
        phaseOrder: payload.phaseOrder ?? phaseMeta.order,
        phaseDuration: duration,
        defaultOffsetDays: payload.defaultOffsetDays ?? source.defaultOffsetDays,
        defaultDurationDays: payload.defaultDurationDays ?? source.defaultDurationDays,
        duration,
        defaultTeam: source.defaultTeam,
        defaultInspector: source.defaultInspector,
        materialsNeeded: source.materialsNeeded,
        proposerRole: source.proposerRole,
        ordererRole: source.ordererRole,
        receiverRole: source.receiverRole,
        qcChecklist: source.qcChecklist,
        isMilestone: payload.isMilestone ?? source.isMilestone,
        displayOrder: payload.displayOrder ?? source.displayOrder,
        templateCategory,
        category: payload.category ?? source.category,
        isActive: true,
      },
    });

    if (source.qcTemplate) {
      await tx.qcChecklistTemplate.create({
        data: {
          taskTemplateId: createdTemplate.id,
          preparationSteps: source.qcTemplate.preparationSteps,
          executionSteps: source.qcTemplate.executionSteps,
          commonMistakes: source.qcTemplate.commonMistakes,
          beforeQcSteps: source.qcTemplate.beforeQcSteps,
          createdBy: user.id,
          qcItems: {
            create: source.qcTemplate.qcItems.map((item) => ({
              displayOrder: item.displayOrder,
              title: item.title,
              description: item.description,
              requirePhoto: item.requirePhoto,
            })),
          },
        },
      });
    }

    return tx.taskTemplate.findUnique({
      where: { id: createdTemplate.id },
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
  });

  return NextResponse.json({
    template: cloned,
    message: "Đã clone template thành công",
  });
}
