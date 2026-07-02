import { prisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/push-server";

// KS đi flow /ks-ql/sub → link notification cho họ phải trỏ về màn sub, không phải /proposals cũ.
const KS_QL_ENGINEER_IDS = new Set(["aa42319b-e694-4be2-bae0-faef83601ab5"]);

function proposalLink(recipientId: string, projectId: string, proposalId: string) {
  if (KS_QL_ENGINEER_IDS.has(recipientId)) {
    return `/ks-ql/sub/${projectId}/material/propose/${proposalId}`;
  }
  return `/proposals/${proposalId}`;
}

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
  const link = proposalLink(input.recipientId, input.projectId, input.proposalId);
  await prisma.staffNotification.create({
    data: {
      recipientId: input.recipientId,
      actorUserId: input.actorUserId,
      actorName: input.actorName,
      projectId: input.projectId,
      kind: "material_proposal_update" as const,
      title: input.title,
      body: input.body,
      link,
      refType: "material_proposal",
      refId: input.proposalId,
    },
  });
  await pushOne(input.recipientId, {
    title: input.title,
    body: input.body,
    link,
    tag: `material-proposal-${input.proposalId}`,
  });
}

// Push các bên liên quan (KS chủ + KT + TPTC + admin) khi có comment mới trên đề xuất.
// Trừ tác giả ra để khỏi tự bắn về mình.
export async function notifyMaterialProposalComment(input: {
  proposalId: string;
  projectId: string;
  projectName: string;
  ksId: string;
  authorId: string;
  authorName: string;
  authorRoleLabel: string;
  body: string;
}) {
  const staff = await prisma.user.findMany({
    where: {
      isActive: true,
      OR: [
        { role: "accountant" },
        { role: "construction_manager" },
        { role: "admin" },
      ],
    },
    select: { id: true },
  });
  const recipientIds = new Set<string>();
  recipientIds.add(input.ksId);
  for (const s of staff) recipientIds.add(s.id);
  recipientIds.delete(input.authorId);
  const targets = Array.from(recipientIds);
  if (!targets.length) return;

  const title = `Trao đổi đề xuất: ${input.projectName}`;
  const shortBody = input.body.length > 140 ? `${input.body.slice(0, 137)}…` : input.body;
  const body = `${input.authorRoleLabel} ${input.authorName}: ${shortBody}`;

  await prisma.staffNotification.createMany({
    data: targets.map((rid) => ({
      recipientId: rid,
      actorUserId: input.authorId,
      actorName: input.authorName,
      projectId: input.projectId,
      kind: "material_proposal_update" as const,
      title,
      body,
      link: proposalLink(rid, input.projectId, input.proposalId),
      refType: "material_proposal",
      refId: input.proposalId,
    })),
  });
  await Promise.all(
    targets.map((rid) =>
      pushOne(rid, {
        title,
        body,
        link: proposalLink(rid, input.projectId, input.proposalId),
        tag: `material-proposal-comment-${input.proposalId}`,
      }),
    ),
  );
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
