import { NextResponse } from "next/server";
import { Prisma, ProjectAiAuditAction, ProjectChangeDraftStatus } from "@prisma/client";
import { z } from "zod";
import { requireRole } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

const patchDraftSchema = z.object({
  formData: z.record(z.string(), z.unknown()).optional(),
  status: z.enum([ProjectChangeDraftStatus.draft, ProjectChangeDraftStatus.ready, ProjectChangeDraftStatus.archived]).optional(),
  aiSummary: z.unknown().optional().nullable(),
});

function authError(error: unknown) {
  const msg = error instanceof Error ? error.message : "UNKNOWN";
  if (msg === "401_UNAUTHORIZED") return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (msg === "403_FORBIDDEN") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  return NextResponse.json({ message: "Lỗi xác thực" }, { status: 500 });
}

function fileViewUrl(draftId: string, fileId: string) {
  return `/api/project-drafts/${draftId}/files/${fileId}/file`;
}

export async function GET(_request: Request, { params }: { params: { draftId: string } }) {
  try {
    await requireRole(["admin"]);
  } catch (error) {
    return authError(error);
  }

  const draft = await prisma.projectChangeDraft.findUnique({
    where: { id: params.draftId },
    include: {
      files: { orderBy: { uploadedAt: "desc" } },
      audits: { orderBy: { createdAt: "desc" }, take: 50, include: { actor: { select: { id: true, fullName: true } } } },
      aiRuns: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: {
          proposals: { orderBy: { createdAt: "asc" } },
          conflicts: { orderBy: { createdAt: "asc" } },
        },
      },
    },
  });

  if (!draft) return NextResponse.json({ message: "Không tìm thấy bản nháp" }, { status: 404 });

  return NextResponse.json({
    draft: {
      ...draft,
      files: draft.files.map((file) => ({ ...file, viewUrl: fileViewUrl(draft.id, file.id) })),
      latestAiRun: draft.aiRuns[0] || null,
      aiRuns: undefined,
    },
  });
}

export async function PATCH(request: Request, { params }: { params: { draftId: string } }) {
  let current;
  try {
    current = await requireRole(["admin"]);
  } catch (error) {
    return authError(error);
  }

  const body = await request.json().catch(() => null);
  const parsed = patchDraftSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const existed = await prisma.projectChangeDraft.findUnique({ where: { id: params.draftId }, select: { id: true } });
  if (!existed) return NextResponse.json({ message: "Không tìm thấy bản nháp" }, { status: 404 });

  const draft = await prisma.$transaction(async (tx) => {
    const updateData: Prisma.ProjectChangeDraftUncheckedUpdateInput = { updatedBy: current.id };
    if (parsed.data.formData !== undefined) updateData.formData = parsed.data.formData as Prisma.InputJsonValue;
    if (parsed.data.status) updateData.status = parsed.data.status;
    if (parsed.data.aiSummary !== undefined) {
      updateData.aiSummary = parsed.data.aiSummary === null ? Prisma.JsonNull : (parsed.data.aiSummary as Prisma.InputJsonValue);
    }

    const updated = await tx.projectChangeDraft.update({
      where: { id: params.draftId },
      data: updateData,
    });

    await tx.projectAiAudit.create({
      data: {
        draftId: updated.id,
        actorId: current.id,
        action: ProjectAiAuditAction.save_draft,
        payload: {
          status: parsed.data.status || null,
          hasFormData: parsed.data.formData !== undefined,
          hasAiSummary: parsed.data.aiSummary !== undefined,
        },
      },
    });

    return updated;
  });

  return NextResponse.json({ draft, message: "Đã lưu bản nháp" });
}
