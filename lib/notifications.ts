import { prisma } from "@/lib/prisma";
import type { Prisma, StaffNotificationKind, CustomerNotificationKind } from "@prisma/client";
import { sendPushToProjectCustomer, sendPushToUser } from "@/lib/push-server";

const TPTC_ROLE = "construction_manager";

async function getTptcUserIds(): Promise<string[]> {
  const rows = await prisma.user.findMany({
    where: { role: TPTC_ROLE, isActive: true },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

async function getProjectContext(projectId: string) {
  return prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      mainEngineerId: true,
      customerPortalEnabled: true,
      customerPortalToken: true,
    },
  });
}

function buildCustomerPortalUrl(token: string | null, link: string) {
  if (!token) return link;
  if (link.startsWith("http")) return link;
  return link.startsWith("/") ? `/cn/${token}${link}` : `/cn/${token}/${link}`;
}

async function pushStaffNotification(args: {
  recipientIds: string[];
  actorUserId?: string | null;
  title: string;
  body: string | null;
  link: string;
  tag: string;
}) {
  const ids = Array.from(new Set(args.recipientIds.filter((id) => id && id !== args.actorUserId)));
  if (!ids.length) return;
  await Promise.all(
    ids.map(async (recipientId) => {
      const badgeCount = await prisma.staffNotification.count({
        where: { recipientId, isRead: false },
      });
      try {
        await sendPushToUser(recipientId, {
          title: args.title,
          body: args.body ?? undefined,
          url: args.link,
          tag: args.tag,
          badgeCount,
        });
      } catch (err) {
        console.error("[notifications] staff push failed:", recipientId, err);
      }
    }),
  );
}

async function pushCustomerNotification(args: {
  projectId: string;
  customerPortalToken: string | null;
  title: string;
  body: string | null;
  link: string;
  tag: string;
}) {
  const badgeCount = await prisma.customerNotification.count({
    where: { projectId: args.projectId, isRead: false },
  });
  await sendPushToProjectCustomer(args.projectId, {
    title: args.title,
    body: args.body ?? undefined,
    url: buildCustomerPortalUrl(args.customerPortalToken, args.link),
    tag: args.tag,
    badgeCount,
  });
}

type NotifyInput = {
  projectId: string;
  actorUserId?: string | null;
  actorName?: string | null;
  refType?: string | null;
  refId?: string | null;
};

async function createStaffNotifications(
  recipientIds: string[],
  base: NotifyInput,
  kind: StaffNotificationKind,
  title: string,
  body: string | null,
  link: string,
) {
  const uniqueRecipients = Array.from(new Set(recipientIds.filter((id) => id && id !== base.actorUserId)));
  if (!uniqueRecipients.length) return;

  const data: Prisma.StaffNotificationCreateManyInput[] = uniqueRecipients.map((recipientId) => ({
    recipientId,
    projectId: base.projectId,
    kind,
    title,
    body,
    link,
    actorUserId: base.actorUserId ?? null,
    actorName: base.actorName ?? null,
    refType: base.refType ?? null,
    refId: base.refId ?? null,
  }));

  await prisma.staffNotification.createMany({ data });
}

async function createCustomerNotification(
  base: NotifyInput,
  kind: CustomerNotificationKind,
  title: string,
  body: string | null,
  link: string,
) {
  await prisma.customerNotification.create({
    data: {
      projectId: base.projectId,
      kind,
      title,
      body,
      link,
      actorUserId: base.actorUserId ?? null,
      actorName: base.actorName ?? null,
      refType: base.refType ?? null,
      refId: base.refId ?? null,
    },
  });
}

/**
 * Event A — KS check-in nhiệm vụ buổi sáng (gộp nhiều task thành 1 notif).
 * Recipients: TPTC + Chủ nhà (nếu portal enabled).
 */
export async function notifyKsMorningCheckin(input: {
  projectId: string;
  actorUserId: string;
  actorName: string;
  taskCount: number;
  taskNames: string[];
  checkinId?: string;
}) {
  const project = await getProjectContext(input.projectId);
  if (!project) return;

  const tptcIds = await getTptcUserIds();
  const summary = input.taskNames.slice(0, 3).join(", ") + (input.taskNames.length > 3 ? `, +${input.taskNames.length - 3}` : "");
  const title = `${input.actorName} đã check-in ${input.taskCount} nhiệm vụ sáng nay`;
  const body = summary || null;

  const base: NotifyInput = {
    projectId: input.projectId,
    actorUserId: input.actorUserId,
    actorName: input.actorName,
    refType: "checkin",
    refId: input.checkinId ?? null,
  };

  const staffLink = `/projects/${input.projectId}/tasks?filter=today`;
  await Promise.all([
    createStaffNotifications(tptcIds, base, "ks_morning_checkin", title, body, staffLink),
    project.customerPortalEnabled
      ? createCustomerNotification(base, "ks_morning_checkin", title, body, `/timeline?filter=today`)
      : Promise.resolve(),
  ]);

  await pushStaffNotification({
    recipientIds: tptcIds,
    actorUserId: input.actorUserId,
    title,
    body,
    link: staffLink,
    tag: `ks-morning-${input.projectId}`,
  });

  if (project.customerPortalEnabled) {
    await pushCustomerNotification({
      projectId: input.projectId,
      customerPortalToken: project.customerPortalToken,
      title,
      body,
      link: `/timeline?filter=today`,
      tag: `ks-morning-${input.projectId}`,
    });
  }
}

const TASK_UPDATE_DEDUPE_MS = 5 * 60 * 1000;

async function upsertStaffTaskUpdate(
  recipientIds: string[],
  base: NotifyInput,
  title: string,
  body: string | null,
  link: string,
): Promise<string[]> {
  const uniqueRecipients = Array.from(new Set(recipientIds.filter((id) => id && id !== base.actorUserId)));
  if (!uniqueRecipients.length) return [];

  const cutoff = new Date(Date.now() - TASK_UPDATE_DEDUPE_MS);
  const now = new Date();
  const freshRecipients: string[] = [];

  for (const recipientId of uniqueRecipients) {
    const existing = await prisma.staffNotification.findFirst({
      where: {
        recipientId,
        kind: "ks_task_update",
        projectId: base.projectId,
        refType: "task",
        refId: base.refId ?? null,
        actorUserId: base.actorUserId ?? null,
        createdAt: { gte: cutoff },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });

    if (existing) {
      await prisma.staffNotification.update({
        where: { id: existing.id },
        data: { title, body, link, isRead: false, readAt: null, createdAt: now },
      });
    } else {
      await prisma.staffNotification.create({
        data: {
          recipientId,
          projectId: base.projectId,
          kind: "ks_task_update",
          title,
          body,
          link,
          actorUserId: base.actorUserId ?? null,
          actorName: base.actorName ?? null,
          refType: "task",
          refId: base.refId ?? null,
        },
      });
      freshRecipients.push(recipientId);
    }
  }

  return freshRecipients;
}

async function upsertCustomerTaskUpdate(
  base: NotifyInput,
  title: string,
  body: string | null,
  link: string,
): Promise<boolean> {
  const cutoff = new Date(Date.now() - TASK_UPDATE_DEDUPE_MS);
  const now = new Date();

  const existing = await prisma.customerNotification.findFirst({
    where: {
      kind: "ks_task_update",
      projectId: base.projectId,
      refType: "task",
      refId: base.refId ?? null,
      actorUserId: base.actorUserId ?? null,
      createdAt: { gte: cutoff },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });

  if (existing) {
    await prisma.customerNotification.update({
      where: { id: existing.id },
      data: { title, body, link, isRead: false, readAt: null, createdAt: now },
    });
    return false;
  }
  await createCustomerNotification(base, "ks_task_update", title, body, link);
  return true;
}

/**
 * Event B — KS cập nhật tiến độ task (status / photo / progress / meta / check-out).
 * Recipients: TPTC luôn; Chủ nhà chỉ khi portal bật và task visibleToCustomer.
 *
 * Dedupe: trong cửa sổ 5 phút, cùng task + actor → ghi đè notif cũ thay vì tạo
 * mới. Tránh tình trạng upload 14 ảnh đẻ ra 14 bell.
 */
export async function notifyKsTaskUpdate(input: {
  projectId: string;
  taskId: string;
  actorUserId: string;
  actorName: string;
  changeKind: "status" | "photo" | "progress" | "meta" | "checkout";
  taskName: string;
  taskVisibleToCustomer: boolean;
  detail?: string;
}) {
  const project = await getProjectContext(input.projectId);
  if (!project) return;

  const tptcIds = await getTptcUserIds();

  const verb: Record<typeof input.changeKind, string> = {
    status: "đổi trạng thái",
    photo: "đăng ảnh",
    progress: "cập nhật tiến độ",
    meta: "cập nhật thông tin",
    checkout: "check-out cuối ngày",
  };
  const title = `${input.actorName} ${verb[input.changeKind]} nhiệm vụ "${input.taskName}"`;
  const body = input.detail ?? null;

  const base: NotifyInput = {
    projectId: input.projectId,
    actorUserId: input.actorUserId,
    actorName: input.actorName,
    refType: "task",
    refId: input.taskId,
  };

  const shouldNotifyCustomer = project.customerPortalEnabled && input.taskVisibleToCustomer;

  const link = `/tasks/${input.taskId}`;
  const [freshStaffIds, freshCustomer] = await Promise.all([
    upsertStaffTaskUpdate(tptcIds, base, title, body, link),
    shouldNotifyCustomer
      ? upsertCustomerTaskUpdate(base, title, body, link)
      : Promise.resolve(false),
  ]);

  if (freshStaffIds.length) {
    await pushStaffNotification({
      recipientIds: freshStaffIds,
      actorUserId: input.actorUserId,
      title,
      body,
      link,
      tag: `ks-task-${input.taskId}`,
    });
  }

  if (shouldNotifyCustomer && freshCustomer) {
    await pushCustomerNotification({
      projectId: input.projectId,
      customerPortalToken: project.customerPortalToken,
      title,
      body,
      link,
      tag: `ks-task-${input.taskId}`,
    });
  }
}

/**
 * Event D — KS hoàn tất checklist QC → task chờ TPTC duyệt nội bộ.
 * Recipients: TPTC. Tag push riêng để không bị dedupe của ks_task_update nuốt
 * (KS thường vừa upload ảnh/đổi tiến độ ngay trước khi mark-done).
 */
export async function notifyKsTaskAwaitingApproval(input: {
  projectId: string;
  taskId: string;
  taskCode: string | null;
  taskName: string;
  actorUserId: string;
  actorName: string;
}) {
  const project = await getProjectContext(input.projectId);
  if (!project) return;

  const tptcIds = await getTptcUserIds();
  if (!tptcIds.length) return;

  const codePrefix = input.taskCode ? `${input.taskCode} ` : "";
  const title = `${input.actorName} đã hoàn tất QC nhiệm vụ "${codePrefix}${input.taskName}"`;
  const body = "Chờ TPTC duyệt nội bộ";
  const link = `/tasks/${input.taskId}`;

  const base: NotifyInput = {
    projectId: input.projectId,
    actorUserId: input.actorUserId,
    actorName: input.actorName,
    refType: "task",
    refId: input.taskId,
  };

  await createStaffNotifications(tptcIds, base, "task_awaiting_internal_approval", title, body, link);

  await pushStaffNotification({
    recipientIds: tptcIds,
    actorUserId: input.actorUserId,
    title,
    body,
    link,
    tag: `task-approval-${input.taskId}`,
  });
}

/**
 * Event E — TPTC đánh dấu công trường nghỉ hôm nay.
 * Recipients: Chủ nhà (nếu portal bật) + KS chính + tất cả KS có task active trên project.
 * Không gán link (bell hiển thị info, click không jump).
 */
export async function notifySiteRestDay(input: {
  projectId: string;
  restDate: Date;
  reason: string;
  note?: string | null;
  actorUserId: string;
  actorName: string;
  siteRestDayId: string;
}) {
  const project = await prisma.project.findUnique({
    where: { id: input.projectId },
    select: {
      id: true,
      code: true,
      name: true,
      mainEngineerId: true,
      customerPortalEnabled: true,
      customerPortalToken: true,
    },
  });
  if (!project) return;

  const reasonLabel: Record<string, string> = {
    SUNDAY: "Chủ Nhật",
    HOLIDAY: "Lễ/Tết",
    STORM: "Mưa bão",
    OTHER: "Khác",
  };
  const reasonText = reasonLabel[input.reason] ?? input.reason;
  const dateText = `${String(input.restDate.getUTCDate()).padStart(2, "0")}/${String(input.restDate.getUTCMonth() + 1).padStart(2, "0")}`;
  const title = `🏖️ Công trường nghỉ ngày ${dateText} — ${project.name}`;
  const body = input.note ? `${reasonText} · ${input.note}` : reasonText;

  const ksTasks = await prisma.task.findMany({
    where: {
      projectId: input.projectId,
      isActive: true,
      assignedEngineerId: { not: null },
    },
    select: { assignedEngineerId: true },
  });
  const ksIds = Array.from(
    new Set(
      [project.mainEngineerId, ...ksTasks.map((t) => t.assignedEngineerId).filter(Boolean) as string[]],
    ),
  );

  const base: NotifyInput = {
    projectId: input.projectId,
    actorUserId: input.actorUserId,
    actorName: input.actorName,
    refType: "site_rest_day",
    refId: input.siteRestDayId,
  };

  await createStaffNotifications(ksIds, base, "project_site_rest", title, body, "");

  await pushStaffNotification({
    recipientIds: ksIds,
    actorUserId: input.actorUserId,
    title,
    body,
    link: "",
    tag: `site-rest-${input.projectId}-${input.siteRestDayId}`,
  });

  if (project.customerPortalEnabled) {
    await createCustomerNotification(base, "project_site_rest", title, body, "");
    await pushCustomerNotification({
      projectId: input.projectId,
      customerPortalToken: project.customerPortalToken,
      title,
      body,
      link: "",
      tag: `site-rest-${input.projectId}-${input.siteRestDayId}`,
    });
  }
}

/**
 * Event C — Chủ nhà comment trên portal.
 * Recipients: KS phụ trách + TPTC.
 */
export async function notifyCustomerComment(input: {
  projectId: string;
  commentId: string;
  authorName: string;
  contentExcerpt: string;
  taskId?: string | null;
  targetLabel?: string;
}) {
  const project = await getProjectContext(input.projectId);
  if (!project) return;

  const tptcIds = await getTptcUserIds();
  const recipients = [project.mainEngineerId, ...tptcIds];

  const title = input.targetLabel
    ? `${input.authorName} (chủ nhà) đã comment về "${input.targetLabel}"`
    : `${input.authorName} (chủ nhà) đã gửi 1 comment mới`;
  const body = input.contentExcerpt;

  const base: NotifyInput = {
    projectId: input.projectId,
    actorUserId: null,
    actorName: `${input.authorName} (chủ nhà)`,
    refType: "comment",
    refId: input.commentId,
  };

  const link = input.taskId ? `/tasks/${input.taskId}` : `/projects/${input.projectId}/comments`;

  await createStaffNotifications(recipients, base, "customer_comment", title, body, link);
}

/**
 * Wrapper an toàn: gọi từ route handler sau khi DB commit thành công.
 * Lỗi notif không làm fail request gốc.
 */
export function fireAndForget(promise: Promise<unknown>) {
  promise.catch((err) => {
    console.error("[notifications] failed:", err);
  });
}
