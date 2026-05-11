import { NextResponse } from "next/server";
import { Prisma, ProjectAiAuditAction, ProjectChangeDraftMode } from "@prisma/client";
import { z } from "zod";
import { requireRole } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

const createDraftSchema = z.object({
  mode: z.nativeEnum(ProjectChangeDraftMode),
  projectId: z.string().uuid("Dự án không hợp lệ").optional().nullable(),
  formData: z.record(z.string(), z.unknown()).optional().default({}),
});

function authError(error: unknown) {
  const msg = error instanceof Error ? error.message : "UNKNOWN";
  if (msg === "401_UNAUTHORIZED") return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (msg === "403_FORBIDDEN") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  return NextResponse.json({ message: "Lỗi xác thực" }, { status: 500 });
}

export async function POST(request: Request) {
  let current;
  try {
    current = await requireRole(["admin"]);
  } catch (error) {
    return authError(error);
  }

  const body = await request.json().catch(() => null);
  const parsed = createDraftSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const { mode, projectId, formData } = parsed.data;
  if (mode === ProjectChangeDraftMode.update_project && !projectId) {
    return NextResponse.json({ message: "Cập nhật dự án cần projectId" }, { status: 400 });
  }

  if (projectId) {
    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
    if (!project) return NextResponse.json({ message: "Không tìm thấy dự án" }, { status: 404 });
  }

  const draft = await prisma.$transaction(async (tx) => {
    const created = await tx.projectChangeDraft.create({
      data: {
        mode,
        projectId: projectId || null,
        formData: formData as Prisma.InputJsonValue,
        createdBy: current.id,
        updatedBy: current.id,
      },
    });

    await tx.projectAiAudit.create({
      data: {
        draftId: created.id,
        actorId: current.id,
        action: ProjectAiAuditAction.create_draft,
        payload: { mode, projectId: projectId || null },
      },
    });

    return created;
  });

  return NextResponse.json({ draft, message: "Đã tạo bản nháp" });
}
