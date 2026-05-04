import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-helpers";

const qcItemSchema = z.object({
  displayOrder: z.number().int().min(1),
  title: z.string().trim().min(1),
  description: z.string().trim().nullable().optional(),
  requirePhoto: z.boolean().default(false),
});

const qcTemplateSchema = z.object({
  preparationSteps: z.string().nullable().optional(),
  executionSteps: z.string().nullable().optional(),
  commonMistakes: z.string().nullable().optional(),
  beforeQcSteps: z.string().nullable().optional(),
  items: z.array(qcItemSchema).min(1).max(15),
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

function hasUniqueDisplayOrders(items: Array<{ displayOrder: number }>) {
  return new Set(items.map((item) => item.displayOrder)).size === items.length;
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
      qcTemplate: {
        include: {
          qcItems: {
            orderBy: { displayOrder: "asc" },
          },
        },
      },
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

  return NextResponse.json({
    template: {
      id: template.id,
      code: template.code,
      name: template.name,
    },
    qcTemplate: template.qcTemplate,
  });
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireRole(["admin"]);
  } catch (error) {
    return mapAuthError(error) || NextResponse.json({ message: "Lỗi xác thực" }, { status: 500 });
  }

  const template = await loadTemplate(params.id);
  if (!template) {
    return NextResponse.json({ message: "Không tìm thấy template" }, { status: 404 });
  }

  if (template.qcTemplate) {
    return NextResponse.json({ message: "Template đã có QC, dùng PATCH để cập nhật" }, { status: 409 });
  }

  const body = await request.json().catch(() => null);
  const parsed = qcTemplateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  if (!hasUniqueDisplayOrders(parsed.data.items)) {
    return NextResponse.json({ message: "displayOrder bị trùng trong checklist" }, { status: 400 });
  }

  const created = await prisma.qcChecklistTemplate.create({
    data: {
      taskTemplateId: params.id,
      createdBy: user.id,
      preparationSteps: cleanText(parsed.data.preparationSteps),
      executionSteps: cleanText(parsed.data.executionSteps),
      commonMistakes: cleanText(parsed.data.commonMistakes),
      beforeQcSteps: cleanText(parsed.data.beforeQcSteps),
      qcItems: {
        create: parsed.data.items.map((item) => ({
          displayOrder: item.displayOrder,
          title: item.title.trim(),
          description: cleanText(item.description),
          requirePhoto: item.requirePhoto,
        })),
      },
    },
    include: {
      qcItems: {
        orderBy: { displayOrder: "asc" },
      },
    },
  });

  return NextResponse.json({ qcTemplate: created, message: "Đã tạo QC template" });
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireRole(["admin"]);
  } catch (error) {
    return mapAuthError(error) || NextResponse.json({ message: "Lỗi xác thực" }, { status: 500 });
  }

  const template = await loadTemplate(params.id);
  if (!template) {
    return NextResponse.json({ message: "Không tìm thấy template" }, { status: 404 });
  }

  if (!template.qcTemplate) {
    return NextResponse.json({ message: "Template chưa có QC, dùng POST để tạo" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = qcTemplateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  if (!hasUniqueDisplayOrders(parsed.data.items)) {
    return NextResponse.json({ message: "displayOrder bị trùng trong checklist" }, { status: 400 });
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.qcChecklistItem.deleteMany({ where: { templateId: template.qcTemplate!.id } });

    return tx.qcChecklistTemplate.update({
      where: { id: template.qcTemplate!.id },
      data: {
        preparationSteps: cleanText(parsed.data.preparationSteps),
        executionSteps: cleanText(parsed.data.executionSteps),
        commonMistakes: cleanText(parsed.data.commonMistakes),
        beforeQcSteps: cleanText(parsed.data.beforeQcSteps),
        qcItems: {
          create: parsed.data.items.map((item) => ({
            displayOrder: item.displayOrder,
            title: item.title.trim(),
            description: cleanText(item.description),
            requirePhoto: item.requirePhoto,
          })),
        },
      },
      include: {
        qcItems: {
          orderBy: { displayOrder: "asc" },
        },
      },
    });
  });

  return NextResponse.json({ qcTemplate: updated, message: "Đã cập nhật QC template" });
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    await requireRole(["admin"]);
  } catch (error) {
    return mapAuthError(error) || NextResponse.json({ message: "Lỗi xác thực" }, { status: 500 });
  }

  const template = await loadTemplate(params.id);
  if (!template) {
    return NextResponse.json({ message: "Không tìm thấy template" }, { status: 404 });
  }

  if (!template.qcTemplate) {
    return NextResponse.json({ message: "Template chưa có QC để xóa" }, { status: 404 });
  }

  await prisma.qcChecklistTemplate.delete({ where: { id: template.qcTemplate.id } });

  return NextResponse.json({ message: "Đã xóa QC template" });
}
