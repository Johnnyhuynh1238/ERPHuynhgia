import { prisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/push-server";

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
  const link = `/proposals?id=${input.proposalId}`;

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
    accountants.map(async (a) => {
      const badgeCount = await prisma.staffNotification.count({
        where: { recipientId: a.id, isRead: false },
      });
      try {
        await sendPushToUser(a.id, {
          title,
          body,
          url: link,
          tag: `material-proposal-${input.proposalId}`,
          requireInteraction: true,
          badgeCount,
        });
      } catch (err) {
        console.error("[material-proposal] push failed", a.id, err);
      }
    }),
  );
}
