import { NextResponse } from "next/server";
import { TaskPhase, UserRole } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-helpers";
import { getPhaseMeta } from "@/lib/task-template-csv";

const templateSchema = z.object({
  code: z.string().trim().min(1),
  phase: z.nativeEnum(TaskPhase),
  name: z.string().trim().min(1),
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
  displayOrder: z.number().int().min(1),
  templateCategory: z.string().trim().min(1).default("nha_pho_1t1l"),
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

export async function GET(request: Request) {
  try {
    await requireRole(["admin"]);
  } catch (error) {
    return mapAuthError(error) || NextResponse.json({ message: "Lỗi xác thực" }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const category = (searchParams.get("category") || "nha_pho_1t1l").trim();
  const includeInactive = searchParams.get("includeInactive") === "1";

  const templates = await prisma.taskTemplate.findMany({
    where: {
      templateCategory: category,
      ...(includeInactive ? {} : { isActive: true }),
    },
    orderBy: [{ displayOrder: "asc" }, { code: "asc" }],
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
  const parsed = templateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const payload = parsed.data;

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

  const phaseMeta = getPhaseMeta(payload.phase);

  const created = await prisma.taskTemplate.create({
    data: {
      ...payload,
      phaseCode: phaseMeta.code,
      phaseName: phaseMeta.name,
      phaseOrder: phaseMeta.order,
      phaseDuration: payload.defaultDurationDays,
      isActive: true,
    },
  });

  return NextResponse.json({ template: created, message: "Đã tạo template" });
}
