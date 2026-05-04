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
      isActive: true,
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
      isActive: true,
    };
  }

  const issue = modern.error?.issues[0]?.message || legacy.error?.issues[0]?.message || "Dữ liệu không hợp lệ";
  throw new Error(issue);
}

export async function GET(request: Request) {
  try {
    await requireRole(["admin"]);
  } catch (error) {
    return mapAuthError(error) || NextResponse.json({ message: "Lỗi xác thực" }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const category = (searchParams.get("category") || DEFAULT_TEMPLATE_CATEGORY).trim();
  const includeInactive = searchParams.get("includeInactive") === "1";
  const phaseCode = (searchParams.get("phaseCode") || "").trim().toUpperCase();
  const taskCategory = (searchParams.get("taskCategory") || "").trim();
  const search = (searchParams.get("q") || "").trim();

  const templates = await prisma.taskTemplate.findMany({
    where: {
      templateCategory: category,
      ...(includeInactive ? {} : { isActive: true }),
      ...(phaseCode ? { phaseCode } : {}),
      ...(taskCategory && Object.values(TaskCategory).includes(taskCategory as TaskCategory)
        ? { category: taskCategory as TaskCategory }
        : {}),
      ...(search
        ? {
            OR: [
              { code: { contains: search, mode: "insensitive" } },
              { name: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    include: {
      qcTemplate: {
        include: {
          qcItems: {
            orderBy: { displayOrder: "asc" },
          },
        },
      },
    },
    orderBy: [{ phaseOrder: "asc" }, { displayOrder: "asc" }, { code: "asc" }],
  });

  return NextResponse.json({ templates, category, includeInactive });
}

export async function POST(request: Request) {
  try {
    await requireRole(["admin"]);
  } catch (error) {
    return mapAuthError(error) || NextResponse.json({ message: "Lỗi xác thực" }, { status: 500 });
  }

  const body = await request.json().catch(() => null);

  let payload;
  try {
    payload = resolveTemplatePayload(body);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Dữ liệu không hợp lệ";
    return NextResponse.json({ message }, { status: 400 });
  }

  const existed = await prisma.taskTemplate.findFirst({
    where: {
      code: payload.code,
      templateCategory: payload.templateCategory,
    },
    select: { id: true, isActive: true },
  });

  if (existed) {
    return NextResponse.json({ message: "Mã template đã tồn tại trong category" }, { status: 400 });
  }

  const created = await prisma.taskTemplate.create({
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

  return NextResponse.json({ template: created, message: "Đã tạo template" });
}
