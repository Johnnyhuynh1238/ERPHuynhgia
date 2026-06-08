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
    console.error("[material-proposal] push failed", recipientId, err);
  }
}

export async function notifyMaterialProposalNew(input: {
  proposalId: string;
  projectId: string;
  projectName: string;
  projectCode: string;
  ksName: string;
  description: string;
  actorUserId: string;
}) {
  const accountants = await prisma.user.findMany({
    where: { role: "accountant", isActive: true },
    select: { id: true },
  });
  if (!accountants.length) return;

  const title = `Đề xuất vật tư mới: ${input.projectName}`;
  const shortDesc =
    input.description.length > 120 ? `${input.description.slice(0, 117)}…` : input.description;
  const body = `${input.ksName} → ${shortDesc}`;
  const link = `/proposals/${input.proposalId}`;

  await prisma.staffNotification.createMany({
    data: accountants.map((a) => ({
      recipientId: a.id,
      actorUserId: input.actorUserId,
      actorName: input.ksName,
      projectId: input.projectId,
      kind: "material_proposal_new" as const,
      title,
      body,
      link,
      refType: "material_proposal",
      refId: input.proposalId,
    })),
  });

  await Promise.all(
    accountants.map((a) =>
      pushOne(a.id, {
        title,
        body,
        link,
        tag: `material-proposal-${input.proposalId}`,
        requireInteraction: true,
      }),
    ),
  );
}

// Push KS khi kế toán đổi trạng thái (accept/decline/ordered) hoặc push kế toán khi KS bấm "đã nhận hàng".
export async function notifyMaterialProposalUpdate(input: {
  proposalId: string;
  projectId: string;
  projectName: string;
  recipientId: string;
  actorUserId: string;
  actorName: string;
  title: string;
  body: string;
}) {
  await prisma.staffNotification.create({
    data: {
      recipientId: input.recipientId,
      actorUserId: input.actorUserId,
      actorName: input.actorName,
      projectId: input.projectId,
      kind: "material_proposal_update" as const,
      title: input.title,
      body: input.body,
      link: `/proposals/${input.proposalId}`,
      refType: "material_proposal",
      refId: input.proposalId,
    },
  });
  await pushOne(input.recipientId, {
    title: input.title,
    body: input.body,
    link: `/proposals/${input.proposalId}`,
    tag: `material-proposal-${input.proposalId}`,
  });
}

// Push nhắc kế toán nếu đã duyệt mà 5p chưa đặt NCC. Cron gọi lặp tới khi đặt NCC.
export async function notifyMaterialProposalReminder(input: {
  proposalId: string;
  projectId: string;
  projectName: string;
  recipientIds: string[];
  ksName: string;
  description: string;
}) {
  if (input.recipientIds.length === 0) return;
  const title = `Nhắc đặt NCC: ${input.projectName}`;
  const shortDesc =
    input.description.length > 100 ? `${input.description.slice(0, 97)}…` : input.description;
  const body = `Đề xuất của ${input.ksName} đã duyệt nhưng chưa đặt NCC: ${shortDesc}`;
  const link = `/proposals/${input.proposalId}`;

  await prisma.staffNotification.createMany({
    data: input.recipientIds.map((rid) => ({
      recipientId: rid,
      actorName: "Hệ thống",
      projectId: input.projectId,
      kind: "material_proposal_reminder" as const,
      title,
      body,
      link,
      refType: "material_proposal",
      refId: input.proposalId,
    })),
  });
  await Promise.all(
    input.recipientIds.map((rid) =>
      pushOne(rid, { title, body, link, tag: `material-proposal-remind-${input.proposalId}` }),
    ),
  );
}
