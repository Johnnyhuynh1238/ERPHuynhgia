import { NextResponse } from "next/server";
import { z } from "zod";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { canViewProposal, isProposalStaffViewer } from "@/lib/proposal-access";
import { notifyMaterialProposalNew, notifyMaterialProposalUpdate } from "@/lib/notify-material-proposal";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const proposal = await prisma.materialProposal.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      description: true,
      status: true,
      orderStatus: true,
      parsedItems: true,
      processedNote: true,
      paymentMethod: true,
      paymentNote: true,
      createdAt: true,
      acceptedAt: true,
      orderedAt: true,
      receivedAt: true,
      paidAt: true,
      reminderDueAt: true,
      ks: { select: { id: true, fullName: true } },
      project: { select: { id: true, code: true, name: true } },
      processor: { select: { id: true, fullName: true } },
    },
  });
  if (!proposal) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (!canViewProposal(user.role, proposal.ks.id, user.id)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const isStaffView = isProposalStaffViewer(user.role);

  return NextResponse.json({
    proposal,
    viewMode: isStaffView ? "accountant" : "ks",
  });
}

const structuredItemSchema = z.object({
  name: z.string().trim().min(1).max(255),
  qty: z.number().positive(),
  unit: z.string().trim().min(1).max(50),
  task: z.string().trim().max(500),
});

const patchSchema = z.object({
  items: z.array(structuredItemSchema).min(1).max(50),
});

// KS chủ sở hữu sửa nội dung + gửi lại đề xuất đã bị từ chối.
// Reset status về pending, xoá metadata duyệt cũ, push lại kế toán.
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation", details: parsed.error.flatten() }, { status: 400 });
  }

  const proposal = await prisma.materialProposal.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      ksId: true,
      projectId: true,
      status: true,
      orderStatus: true,
      closedAt: true,
      project: { select: { id: true, name: true, code: true } },
    },
  });
  if (!proposal) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const isOwnKs = proposal.ksId === user.id;
  const isAdmin = user.role === UserRole.admin;
  const isKt = user.role === UserRole.accountant;

  const items = parsed.data.items;
  const description = items.map((it) => `${it.name} ${it.qty} ${it.unit} — ${it.task}`).join("; ");

  // Nhánh KT/admin: sửa nội dung đề xuất trước khi đặt hàng (sai tên/SL/ĐVT của KS).
  // Không reset trạng thái duyệt — chỉ cập nhật items + báo KS chủ đề xuất biết.
  if ((isKt || isAdmin) && proposal.status !== "declined") {
    if (proposal.closedAt) {
      return NextResponse.json(
        { error: "invalid_state", message: "Đề xuất đã đóng, không sửa được" },
        { status: 409 },
      );
    }
    if (proposal.orderStatus !== "not_ordered") {
      return NextResponse.json(
        { error: "invalid_state", message: "Đã đặt hàng — không sửa nội dung đề xuất được nữa" },
        { status: 409 },
      );
    }

    await prisma.materialProposal.update({
      where: { id: proposal.id },
      data: { description, parsedItems: items },
    });

    const actorName = user.name || user.email || (isKt ? "KT" : "Admin");
    if (proposal.ksId !== user.id) {
      await notifyMaterialProposalUpdate({
        proposalId: proposal.id,
        projectId: proposal.project.id,
        projectName: proposal.project.name,
        recipientId: proposal.ksId,
        actorUserId: user.id,
        actorName,
        title: `${isKt ? "KT" : "Admin"} ${actorName} đã chỉnh đề xuất vật tư`,
        body: `${proposal.project.code} — nội dung items được cập nhật trước khi đặt hàng.`,
      });
    }

    return NextResponse.json({ ok: true, message: "Đã cập nhật nội dung đề xuất" });
  }

  // Nhánh KS chủ sở hữu: gửi lại đề xuất bị từ chối (reset về pending).
  if (!isOwnKs && !isAdmin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (proposal.status !== "declined") {
    return NextResponse.json(
      { error: "invalid_state", message: "Chỉ sửa được đề xuất đã bị từ chối" },
      { status: 409 },
    );
  }

  await prisma.materialProposal.update({
    where: { id: proposal.id },
    data: {
      description,
      parsedItems: items,
      status: "pending",
      processedBy: null,
      processedAt: null,
      processedNote: null,
      reminderDueAt: null,
    },
  });

  const ksRow = await prisma.user.findUnique({
    where: { id: proposal.ksId },
    select: { fullName: true },
  });
  notifyMaterialProposalNew({
    proposalId: proposal.id,
    projectId: proposal.project.id,
    projectName: proposal.project.name,
    projectCode: proposal.project.code,
    ksName: ksRow?.fullName || user.name || user.email || "KS",
    description: `(Gửi lại sau khi sửa) ${description}`,
    actorUserId: user.id,
  }).catch((err) => {
    console.error("[proposals.PATCH] notify failed", err);
  });

  return NextResponse.json({ ok: true });
}
