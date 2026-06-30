import { prisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/push-server";

async function pushOne(
  recipientId: string,
  payload: { title: string; body: string; link: string; tag: string; requireInteraction?: boolean },
) {
  const badgeCount = await prisma.staffNotification.count({
    where: { recipientId, isRead: false },
  });
  try {
    await sendPushToUser(recipientId, {
      title: payload.title,
      body: payload.body,
      url: payload.link,
      tag: payload.tag,
      requireInteraction: payload.requireInteraction ?? false,
      badgeCount,
    });
  } catch (err) {
    console.error("[payment-order] push failed", recipientId, err);
  }
}

// KT tạo lệnh → push tất cả admin để duyệt.
export async function notifyPaymentOrderNew(input: {
  orderId: string;
  code: string;
  supplierName: string;
  totalAmount: number;
  actorUserId: string;
  actorName: string;
}) {
  const admins = await prisma.user.findMany({
    where: { role: "admin", isActive: true },
    select: { id: true },
  });
  if (!admins.length) return;

  const title = `Lệnh thanh toán NCC chờ duyệt: ${input.code}`;
  const body = `${input.actorName} → ${input.supplierName} — ${input.totalAmount.toLocaleString("vi-VN")}đ`;
  const link = `/payment-orders/${input.orderId}`;

  await prisma.staffNotification.createMany({
    data: admins.map((a) => ({
      recipientId: a.id,
      actorUserId: input.actorUserId,
      actorName: input.actorName,
      projectId: null,
      kind: "supplier_payment_order_new" as const,
      title,
      body,
      link,
    })),
  });

  await Promise.all(
    admins.map((a) =>
      pushOne(a.id, {
        title,
        body,
        link,
        tag: `payment-order-${input.orderId}`,
        requireInteraction: true,
      }),
    ),
  );
}

// Admin duyệt/từ chối → push KT (người tạo lệnh).
export async function notifyPaymentOrderDecision(input: {
  orderId: string;
  code: string;
  recipientId: string;
  decision: "approved" | "rejected";
  actorUserId: string;
  actorName: string;
  reasonNote?: string | null;
}) {
  const verb = input.decision === "approved" ? "Duyệt" : "Từ chối";
  const title = `${verb} lệnh thanh toán ${input.code}`;
  const body =
    input.decision === "rejected" && input.reasonNote
      ? `${input.actorName} → Từ chối: ${input.reasonNote}`
      : `${input.actorName} → ${verb}`;
  const link = `/payment-orders/${input.orderId}`;

  await prisma.staffNotification.create({
    data: {
      recipientId: input.recipientId,
      actorUserId: input.actorUserId,
      actorName: input.actorName,
      projectId: null,
      kind: "supplier_payment_order_decision" as const,
      title,
      body,
      link,
    },
  });

  await pushOne(input.recipientId, {
    title,
    body,
    link,
    tag: `payment-order-${input.orderId}`,
    requireInteraction: input.decision === "approved",
  });
}
