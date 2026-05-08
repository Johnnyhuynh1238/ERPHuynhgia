import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-helpers";

const createSchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().trim().nullable().optional(),
  guideContent: z.string().trim().nullable().optional(),
  requirePhoto: z.boolean().default(false),
  displayOrder: z.number().int().min(1),
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

function cleanText(value: string | null | undefined) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

async function loadTemplate(templateId: string) {
  return prisma.taskTemplate.findUnique({
    where: { id: templateId },
    select: {
      id: true,
      code: true,
      name: true,
      qcTemplate: { select: { id: true } },
    },
  });
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    await requireRole(["admin", "construction_manager", "engineer"]);
  } catch (error) {
    return mapAuthError(error) || NextResponse.json({ message: "Lỗi xác thực" }, { status: 500 });
  }

  const template = await loadTemplate(params.id);
  if (!template) {
    return NextResponse.json({ message: "Không tìm thấy template" }, { status: 404 });
  }

  const items = await prisma.taskAssignmentTemplateItem.findMany({
    where: { taskTemplateId: params.id },
    orderBy: [{ displayOrder: "asc" }, { title: "asc" }],
  });

  return NextResponse.json({
    template: {
      id: template.id,
      code: template.code,
      name: template.name,
    },
    items,
  });
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireRole(["admin"]);
  } catch (error) {
    return mapAuthError(error) || NextResponse.json({ message: "Lỗi xác thực" }, { status: 500 });
  }

  const template = await loadTemplate(params.id);
  if (!template) {
    return NextResponse.json({ message: "Không tìm thấy template" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const duplicateOrder = await prisma.taskAssignmentTemplateItem.findFirst({
    where: {
      taskTemplateId: params.id,
      displayOrder: parsed.data.displayOrder,
    },
    select: { id: true },
  });

  if (duplicateOrder) {
    return NextResponse.json({ message: "displayOrder đã tồn tại trong template" }, { status: 400 });
  }

  const created = await prisma.taskAssignmentTemplateItem.create({
    data: {
      taskTemplateId: params.id,
      qcTemplateId: template.qcTemplate?.id || null,
      displayOrder: parsed.data.displayOrder,
      title: parsed.data.title.trim(),
      description: cleanText(parsed.data.description),
      guideContent: cleanText(parsed.data.guideContent),
      requirePhoto: parsed.data.requirePhoto,
    },
  });

  return NextResponse.json({ item: created, message: "Đã thêm nhiệm vụ checklist" });
}
