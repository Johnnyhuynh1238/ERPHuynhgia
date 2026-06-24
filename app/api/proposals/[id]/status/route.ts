import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma, UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { notifyMaterialProposalUpdate } from "@/lib/notify-material-proposal";
import { recordCashTxn } from "@/lib/treasury";

const REMINDER_DELAY_MS = 5 * 60 * 1000;

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("accept") }),
  z.object({ action: z.literal("decline"), note: z.string().trim().max(500).optional() }),
  z.object({ action: z.literal("mark_ordered"), note: z.string().trim().max(500).optional() }),
  z.object({ action: z.literal("mark_received") }),
  z.object({
    action: z.literal("mark_paid"),
    paymentMethod: z.enum(["cash", "transfer", "debt"]),
    paymentNote: z.string().trim().max(500).optional(),
    paidAmount: z.coerce.number().positive("Số tiền đã chi phải lớn hơn 0"),
  }),
]);

const ACCOUNTANT_ROLES = new Set<string>([UserRole.accountant, UserRole.admin]);

export async function POST(request: Request, { params }: { params: { id: string } }) {
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
  const parsed = bodySchema.safeParse(raw);
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
      description: true,
      ks: { select: { id: true, fullName: true } },
      project: { select: { id: true, name: true } },
    },
  });
  if (!proposal) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const action = parsed.data.action;
  const isAccountantRole = ACCOUNTANT_ROLES.has(user.role);
  const isOwnKs = proposal.ksId === user.id;

  // Phân quyền theo action
  if (action === "accept" || action === "decline" || action === "mark_ordered" || action === "mark_paid") {
    if (!isAccountantRole) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  } else if (action === "mark_received") {
    if (!isOwnKs && user.role !== UserRole.admin) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }

  // Validate state transition
  const valid =
    (action === "accept" && proposal.status === "pending") ||
    (action === "decline" && proposal.status === "pending") ||
    (action === "mark_ordered" && proposal.status === "accepted" && proposal.orderStatus === "not_ordered") ||
    (action === "mark_received" && proposal.status === "accepted" && proposal.orderStatus === "ordered") ||
    (action === "mark_paid" && proposal.status === "accepted" && proposal.orderStatus === "received");
  if (!valid) {
    return NextResponse.json(
      { error: "invalid_transition", current: { status: proposal.status, orderStatus: proposal.orderStatus } },
      { status: 409 },
    );
  }

  const now = new Date();
  const actorName =
    (await prisma.user.findUnique({ where: { id: user.id }, select: { fullName: true } }))?.fullName ||
    user.name ||
    user.email ||
    "Người dùng";

  // Build update payload + notif theo action
  let updateData: Parameters<typeof prisma.materialProposal.update>[0]["data"] = {};
  let pushTitle = "";
  let pushBody = "";
  let pushRecipientId: string | null = null;

  if (action === "accept") {
    updateData = {
      status: "accepted",
      acceptedAt: now,
      reminderDueAt: new Date(now.getTime() + REMINDER_DELAY_MS),
      processedBy: user.id,
      processedAt: now,
    };
    pushTitle = `Đề xuất đã duyệt: ${proposal.project.name}`;
    pushBody = `${actorName} đã duyệt đề xuất, chờ đặt NCC.`;
    pushRecipientId = proposal.ksId;
  } else if (action === "decline") {
    updateData = {
      status: "declined",
      processedBy: user.id,
      processedAt: now,
      processedNote: parsed.data.note || null,
      reminderDueAt: null,
    };
    pushTitle = `Đề xuất bị từ chối: ${proposal.project.name}`;
    pushBody = parsed.data.note ? `Lý do: ${parsed.data.note}` : "Kế toán đã từ chối đề xuất.";
    pushRecipientId = proposal.ksId;
  } else if (action === "mark_ordered") {
    updateData = {
      orderStatus: "ordered",
      orderedAt: now,
      reminderDueAt: null,
      processedNote: parsed.data.note || undefined,
    };
    pushTitle = `Đã đặt NCC: ${proposal.project.name}`;
    pushBody = "Đơn vật tư đã đặt nhà cung cấp, chờ giao tới công trình.";
    pushRecipientId = proposal.ksId;
  } else if (action === "mark_received") {
    updateData = {
      orderStatus: "received",
      receivedAt: now,
    };
    // Push lại kế toán + admin (người xử lý)
    const recipients = await prisma.user.findMany({
      where: {
        OR: [{ role: "accountant" }, { role: "admin" }],
        isActive: true,
      },
      select: { id: true },
    });
    await prisma.materialProposal.update({ where: { id: proposal.id }, data: updateData });
    await Promise.all(
      recipients.map((r) =>
        notifyMaterialProposalUpdate({
          proposalId: proposal.id,
          projectId: proposal.projectId,
          projectName: proposal.project.name,
          recipientId: r.id,
          actorUserId: user.id,
          actorName,
          title: `KS đã nhận hàng: ${proposal.project.name}`,
          body: `${actorName} xác nhận đã nhận hàng tại công trình. Chuẩn bị thanh toán.`,
        }),
      ),
    );
    return NextResponse.json({ ok: true });
  } else if (action === "mark_paid") {
    const paidAmount = parsed.data.paidAmount;
    const paymentMethod = parsed.data.paymentMethod;
    const paymentNote = parsed.data.paymentNote || null;
    const isDebt = paymentMethod === "debt";

    await prisma.$transaction(async (tx) => {
      await tx.materialProposal.update({
        where: { id: proposal.id },
        data: {
          orderStatus: "paid",
          paidAt: now,
          paymentMethod,
          paymentNote,
          paidAmount: new Prisma.Decimal(paidAmount),
        },
      });
      // Công nợ (debt) chưa xuất quỹ thực → không ghi cash_txn
      if (!isDebt) {
        await recordCashTxn(tx, {
          direction: "out",
          amount: paidAmount,
          occurredAt: now,
          refType: "material_proposal",
          refId: proposal.id,
          projectId: proposal.projectId,
          categoryId: null,
          note: `Chi vật tư đề xuất "${proposal.description.slice(0, 80)}" [${paymentMethod}]${paymentNote ? ` — ${paymentNote}` : ""}`,
          createdBy: user.id,
        });
      }
    });
    // Không push KS (theo yêu cầu)
    return NextResponse.json({ ok: true });
  }

  await prisma.materialProposal.update({ where: { id: proposal.id }, data: updateData });

  if (pushRecipientId) {
    await notifyMaterialProposalUpdate({
      proposalId: proposal.id,
      projectId: proposal.projectId,
      projectName: proposal.project.name,
      recipientId: pushRecipientId,
      actorUserId: user.id,
      actorName,
      title: pushTitle,
      body: pushBody,
    });
  }

  return NextResponse.json({ ok: true });
}
