import { NextResponse } from "next/server";
import { Prisma, ProjectAiAuditAction, ProjectAiProposalAction } from "@prisma/client";
import { z } from "zod";
import { requireRole } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

const applySchema = z.object({
  proposalIds: z.array(z.string().uuid()).min(1, "Cần chọn ít nhất 1 đề xuất"),
});

type DraftFormData = Record<string, unknown>;

function authError(error: unknown) {
  const msg = error instanceof Error ? error.message : "UNKNOWN";
  if (msg === "401_UNAUTHORIZED") return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (msg === "403_FORBIDDEN") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  return NextResponse.json({ message: "Lỗi xác thực" }, { status: 500 });
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

function isMeaningful(value: unknown) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

function pathParts(path: string) {
  return path.replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean);
}

function getPath(source: DraftFormData, path: string) {
  let cursor: unknown = source;
  for (const part of pathParts(path)) {
    if (cursor === null || cursor === undefined || typeof cursor !== "object") return undefined;
    cursor = (cursor as Record<string, unknown>)[part];
  }
  return cursor;
}

function setPath(target: DraftFormData, path: string, value: unknown) {
  const parts = pathParts(path);
  let cursor: Record<string, unknown> = target;
  parts.slice(0, -1).forEach((part) => {
    if (!cursor[part] || typeof cursor[part] !== "object" || Array.isArray(cursor[part])) cursor[part] = {};
    cursor = cursor[part] as Record<string, unknown>;
  });
  cursor[parts[parts.length - 1]] = value;
}

function appendPath(target: DraftFormData, path: string, value: unknown) {
  const current = getPath(target, path);
  const currentArray = Array.isArray(current) ? current : [];
  const nextItems = Array.isArray(value) ? value : [value];
  setPath(target, path, [...currentArray, ...nextItems]);
}

export async function POST(request: Request, { params }: { params: { draftId: string } }) {
  let current;
  try {
    current = await requireRole(["admin", "construction_manager"]);
  } catch (error) {
    return authError(error);
  }

  const body = await request.json().catch(() => null);
  const parsed = applySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const draft = await prisma.projectChangeDraft.findUnique({ where: { id: params.draftId }, select: { id: true, formData: true } });
  if (!draft) return NextResponse.json({ message: "Không tìm thấy bản nháp" }, { status: 404 });

  const proposals = await prisma.projectAiProposal.findMany({
    where: {
      id: { in: parsed.data.proposalIds },
      run: { draftId: params.draftId },
    },
    orderBy: { createdAt: "asc" },
  });

  if (proposals.length === 0) return NextResponse.json({ message: "Không tìm thấy đề xuất hợp lệ" }, { status: 404 });

  const formData = (draft.formData && typeof draft.formData === "object" && !Array.isArray(draft.formData)
    ? JSON.parse(JSON.stringify(draft.formData))
    : {}) as DraftFormData;
  const appliedIds: string[] = [];
  const skippedIds: string[] = [];
  const appliedFields: Array<{ id: string; fieldPath: string; action: ProjectAiProposalAction }> = [];
  const skippedFields: Array<{ id: string; fieldPath: string; action: ProjectAiProposalAction; reason: string }> = [];

  for (const proposal of proposals) {
    if (proposal.action === ProjectAiProposalAction.warning_only) {
      skippedIds.push(proposal.id);
      skippedFields.push({ id: proposal.id, fieldPath: proposal.fieldPath, action: proposal.action, reason: "warning_only" });
      continue;
    }

    if (proposal.action === ProjectAiProposalAction.supplement) {
      appendPath(formData, proposal.fieldPath, proposal.suggestedValue);
      appliedIds.push(proposal.id);
      appliedFields.push({ id: proposal.id, fieldPath: proposal.fieldPath, action: proposal.action });
      continue;
    }

    const currentValue = getPath(formData, proposal.fieldPath);
    if (isMeaningful(currentValue)) {
      skippedIds.push(proposal.id);
      skippedFields.push({ id: proposal.id, fieldPath: proposal.fieldPath, action: proposal.action, reason: "existing_value" });
      continue;
    }

    setPath(formData, proposal.fieldPath, proposal.suggestedValue);
    appliedIds.push(proposal.id);
    appliedFields.push({ id: proposal.id, fieldPath: proposal.fieldPath, action: proposal.action });
  }

  console.info("[project-ai] apply proposals", {
    draftId: params.draftId,
    requestedIds: parsed.data.proposalIds.length,
    appliedIds: appliedIds.length,
    skippedIds: skippedIds.length,
    appliedFields,
    skippedFields,
  });

  if (appliedIds.length === 0) {
    return NextResponse.json({ message: "Không có đề xuất nào được apply vì field đã có dữ liệu hoặc chỉ là cảnh báo", skippedIds }, { status: 400 });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const draftRow = await tx.projectChangeDraft.update({
      where: { id: params.draftId },
      data: { formData: toJson(formData), updatedBy: current.id },
    });

    await tx.projectAiAudit.create({
      data: {
        draftId: params.draftId,
        actorId: current.id,
        action: ProjectAiAuditAction.apply_proposal,
        payload: { appliedIds, skippedIds },
      },
    });

    return draftRow;
  });

  return NextResponse.json({ draft: updated, appliedIds, skippedIds, message: "Đã apply đề xuất vào bản nháp" });
}
