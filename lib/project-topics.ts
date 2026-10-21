/**
 * Ô trao đổi công việc nội bộ dự án (chủ đề + bình luận).
 *
 * Thành viên = ai có ProjectMemberAssignment của dự án (KS, KT, TPTC...) + mọi admin.
 * - Tạo chủ đề → thông báo app (StaffNotification + push) + Zalo cho mọi thành viên (trừ người tạo).
 * - Bình luận   → thông báo app cho mọi thành viên (trừ người viết), không Zalo.
 */
import { prisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/push-server";
import { lookupZaloUserByPhone, sendZaloBridge } from "@/lib/zalo-notify";

const SITE_URL = (process.env.NEXTAUTH_URL || "https://erp.huynhgia6.com").replace(/\/$/, "");

/** Link chung cho thông báo — /trao-doi/[projectId] tự chuyển về màn đúng theo vai trò. */
export function topicLink(projectId: string, topicId?: string | null) {
  return `/trao-doi/${projectId}${topicId ? `?t=${topicId}` : ""}`;
}

/** Dự án user được vào ô trao đổi: admin mọi dự án, còn lại phải là thành viên. */
export async function findTopicProject(projectId: string, user: { id: string; role: string }) {
  return prisma.project.findFirst({
    where: {
      id: projectId,
      ...(user.role === "admin" ? {} : { memberAssignments: { some: { userId: user.id } } }),
    },
    select: { id: true, code: true, name: true },
  });
}

async function getTopicMembers(projectId: string) {
  const [assignments, admins] = await Promise.all([
    prisma.projectMemberAssignment.findMany({
      where: { projectId, user: { isActive: true } },
      select: { user: { select: { id: true, role: true, phone: true, zaloThreadId: true } } },
    }),
    prisma.user.findMany({
      where: { role: "admin", isActive: true },
      select: { id: true, role: true, phone: true, zaloThreadId: true },
    }),
  ]);
  const byId = new Map<string, (typeof admins)[number]>();
  for (const a of assignments) byId.set(a.user.id, a.user);
  for (const u of admins) byId.set(u.id, u);
  return Array.from(byId.values());
}

async function notifyApp(input: {
  projectId: string;
  recipientIds: string[];
  actorId: string;
  actorName: string;
  kind: "project_topic_new" | "project_topic_comment";
  title: string;
  body: string | null;
  topicId: string;
}) {
  const ids = input.recipientIds.filter((id) => id !== input.actorId);
  if (!ids.length) return;
  const link = topicLink(input.projectId, input.topicId);
  await prisma.staffNotification.createMany({
    data: ids.map((recipientId) => ({
      recipientId,
      projectId: input.projectId,
      kind: input.kind,
      title: input.title,
      body: input.body,
      link,
      actorUserId: input.actorId,
      actorName: input.actorName,
      refType: "project_topic",
      refId: input.topicId,
    })),
  });
  await Promise.all(
    ids.map(async (recipientId) => {
      try {
        const badgeCount = await prisma.staffNotification.count({ where: { recipientId, isRead: false } });
        await sendPushToUser(recipientId, {
          title: input.title,
          body: input.body ?? undefined,
          url: link,
          tag: `topic-${input.topicId}`,
          badgeCount,
        });
      } catch (err) {
        console.error("[project-topics] push failed:", recipientId, err);
      }
    }),
  );
}

/** Thread Zalo 1-1 của user: có sẵn thì dùng, chưa có thì tra theo SĐT rồi lưu lại (như ks-daily-report). */
async function resolveZaloThread(u: { id: string; phone: string | null; zaloThreadId: string | null }) {
  if (u.zaloThreadId) return u.zaloThreadId;
  const zaloId = u.phone ? await lookupZaloUserByPhone(u.phone) : null;
  if (!zaloId) return null;
  const taken = await prisma.user.findFirst({ where: { zaloThreadId: zaloId }, select: { id: true } });
  if (!taken) await prisma.user.update({ where: { id: u.id }, data: { zaloThreadId: zaloId } });
  return zaloId;
}

function clip(s: string, n: number) {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

export async function notifyTopicCreated(topicId: string) {
  const topic = await prisma.projectTopic.findUnique({
    where: { id: topicId },
    select: {
      id: true,
      title: true,
      body: true,
      authorId: true,
      authorName: true,
      project: { select: { id: true, name: true } },
    },
  });
  if (!topic) return;
  const members = await getTopicMembers(topic.project.id);
  const others = members.filter((m) => m.id !== topic.authorId);

  await notifyApp({
    projectId: topic.project.id,
    recipientIds: others.map((m) => m.id),
    actorId: topic.authorId,
    actorName: topic.authorName,
    kind: "project_topic_new",
    title: `💬 ${topic.authorName} tạo chủ đề: ${clip(topic.title, 80)}`,
    body: `${topic.project.name}${topic.body ? ` · ${clip(topic.body, 120)}` : ""}`,
    topicId: topic.id,
  });

  // Link để CUỐI tin: Zalo hay gộp chữ dòng sau vào link.
  const text =
    `💬 Chủ đề mới — ${topic.project.name}\n` +
    `${topic.authorName}: ${topic.title}\n` +
    (topic.body ? `${clip(topic.body, 400)}\n` : "") +
    `Vào ERP xem + trả lời:\n${SITE_URL}${topicLink(topic.project.id, topic.id)}`;

  // Chưa có thread 1-1 → KT gửi đích "ketoan", admin gửi đích "admin" của bridge (mỗi đích 1 lần).
  const sentFallback = new Set<string>();
  for (const m of others) {
    try {
      const thread = await resolveZaloThread(m);
      if (thread) {
        await sendZaloBridge({ threadId: thread, text });
      } else {
        const to = m.role === "accountant" ? "ketoan" : m.role === "admin" ? "admin" : null;
        if (to && !sentFallback.has(to)) {
          sentFallback.add(to);
          await sendZaloBridge({ to, text });
        }
      }
    } catch (err) {
      console.error("[project-topics] zalo failed:", m.id, err);
    }
  }
}

export async function notifyTopicComment(commentId: string) {
  const c = await prisma.projectTopicComment.findUnique({
    where: { id: commentId },
    select: {
      body: true,
      authorId: true,
      authorName: true,
      topic: { select: { id: true, title: true, project: { select: { id: true, name: true } } } },
    },
  });
  if (!c) return;
  const members = await getTopicMembers(c.topic.project.id);
  await notifyApp({
    projectId: c.topic.project.id,
    recipientIds: members.map((m) => m.id),
    actorId: c.authorId,
    actorName: c.authorName,
    kind: "project_topic_comment",
    title: `💬 ${c.authorName} bình luận: ${clip(c.topic.title, 80)}`,
    body: `${c.topic.project.name} · ${clip(c.body, 140)}`,
    topicId: c.topic.id,
  });
}
