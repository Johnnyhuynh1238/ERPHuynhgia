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

const WORKER_ATTENDANCE_DEDUPE_MS = 30 * 60 * 1000;

/**
 * Event — KS chấm công thợ (sáng/chiều). Recipients: TPTC.
 * Dedupe theo (project × ks × ngày × buổi) trong 30 phút để KS save lại nhiều
 * lần không spam, notif cũ được update với số liệu mới nhất.
 */
export async function notifyKsWorkerAttendance(input: {
  projectId: string;
  actorUserId: string;
  actorName: string;
  session: "morning" | "afternoon";
  date: string;
  presentCount: number;
  totalCount: number;
  sampleWorkerNames: string[];
}) {
  const project = await getProjectContext(input.projectId);
  if (!project) return;

  const tptcIds = await getTptcUserIds();
  const recipients = Array.from(new Set(tptcIds.filter((id) => id !== input.actorUserId)));
  if (!recipients.length) return;

  const projectInfo = await prisma.project.findUnique({
    where: { id: input.projectId },
    select: { code: true, name: true },
  });
  const projectLabel = projectInfo ? `${projectInfo.code} · ${projectInfo.name}` : "";

  const sessionLabel = input.session === "morning" ? "buổi sáng" : "buổi chiều";
  const title = `${input.actorName} đã chấm công ${input.presentCount}/${input.totalCount} thợ ${sessionLabel}${projectLabel ? ` — ${projectLabel}` : ""}`;
  const sample = input.sampleWorkerNames.slice(0, 3).join(", ");
  const extra = input.sampleWorkerNames.length > 3 ? `, +${input.sampleWorkerNames.length - 3}` : "";
  const body = sample ? `${sample}${extra}` : null;

  const refId = `${input.date}-${input.session}`;
  const link = `/admin/worker-attendance?projectId=${input.projectId}&date=${input.date}`;
  const cutoff = new Date(Date.now() - WORKER_ATTENDANCE_DEDUPE_MS);
  const now = new Date();
  const freshRecipients: string[] = [];

  for (const recipientId of recipients) {
    const existing = await prisma.staffNotification.findFirst({
      where: {
        recipientId,
        kind: "ks_worker_attendance",
        projectId: input.projectId,
        refType: "worker_attendance",
        refId,
        actorUserId: input.actorUserId,
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
          projectId: input.projectId,
          kind: "ks_worker_attendance",
          title,
          body,
          link,
          actorUserId: input.actorUserId,
          actorName: input.actorName,
          refType: "worker_attendance",
          refId,
        },
      });
      freshRecipients.push(recipientId);
    }
  }

  if (freshRecipients.length) {
    await pushStaffNotification({
      recipientIds: freshRecipients,
      actorUserId: input.actorUserId,
      title,
      body,
      link,
      tag: `ks-worker-att-${input.projectId}-${input.session}`,
    });
  }
}

/**
 * Event — KS (hoặc kế toán) chấm công vào/ra. Recipients: TPTC.
 * Không dedupe — mỗi event là 1 hành động riêng.
 */
export async function notifyKsAttendance(input: {
  actorUserId: string;
  actorName: string;
  kind: "check_in" | "check_out";
  at: Date;
  lateMinutes?: number | null;
  earlyLeaveMinutes?: number | null;
  durationMinutes?: number | null;
}) {
  const tptcIds = await getTptcUserIds();
  const recipients = tptcIds.filter((id) => id !== input.actorUserId);
  if (!recipients.length) return;

  const timeLabel = new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(input.at);

  const isCheckIn = input.kind === "check_in";
  const verb = isCheckIn ? "đã chấm vào" : "đã chấm ra";
  const lateSuffix =
    isCheckIn && typeof input.lateMinutes === "number" && input.lateMinutes > 0
      ? ` (trễ ${input.lateMinutes}p)`
      : "";
  const earlySuffix =
    !isCheckIn && typeof input.earlyLeaveMinutes === "number" && input.earlyLeaveMinutes > 0
      ? ` (về sớm ${input.earlyLeaveMinutes}p)`
      : "";
  const title = `${input.actorName} ${verb} lúc ${timeLabel}${lateSuffix}${earlySuffix}`;

  const body =
    !isCheckIn && typeof input.durationMinutes === "number" && input.durationMinutes > 0
      ? `Tổng thời gian: ${Math.floor(input.durationMinutes / 60)}h${String(input.durationMinutes % 60).padStart(2, "0")}p`
      : null;

  const dateLabel = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(input.at);
  const link = `/admin/attendance?date=${dateLabel}`;
  const refId = `${dateLabel}-${input.kind}-${input.actorUserId}`;

  await prisma.staffNotification.createMany({
    data: recipients.map((recipientId) => ({
      recipientId,
      projectId: null,
      kind: "ks_attendance" as StaffNotificationKind,
      title,
      body,
      link,
      actorUserId: input.actorUserId,
      actorName: input.actorName,
      refType: "ks_attendance",
      refId,
    })),
  });

  await pushStaffNotification({
    recipientIds: recipients,
    actorUserId: input.actorUserId,
    title,
    body,
    link,
    tag: `ks-attendance-${input.actorUserId}-${input.kind}-${dateLabel}`,
  });
}

/**
 * Event — TPTC giao việc đột xuất cho KS. Recipients: KS được giao (assignee).
 */
export async function notifyTptcAssignment(input: {
  projectId: string;
  assignmentId: string;
  assigneeUserId: string;
  actorUserId: string;
  actorName: string;
  title: string;
  priority: "normal" | "important" | "urgent" | "critical";
  dueAt: Date;
}) {
  const project = await getProjectContext(input.projectId);
  if (!project) return;

  const priorityPrefix: Record<typeof input.priority, string> = {
    normal: "",
    important: "[Quan trọng] ",
    urgent: "[Khẩn] ",
    critical: "[Cực khẩn] ",
  };
  const due = input.dueAt;
  const dueText = `${String(due.getDate()).padStart(2, "0")}/${String(due.getMonth() + 1).padStart(2, "0")} ${String(due.getHours()).padStart(2, "0")}:${String(due.getMinutes()).padStart(2, "0")}`;

  const title = `${priorityPrefix[input.priority]}${input.actorName} giao việc: ${input.title}`;
  const body = `Hạn ${dueText}`;
  const link = `/reports?ackTptc=${input.assignmentId}`;

  const base: NotifyInput = {
    projectId: input.projectId,
    actorUserId: input.actorUserId,
    actorName: input.actorName,
    refType: "tptc_assignment",
    refId: input.assignmentId,
  };

  await createStaffNotifications([input.assigneeUserId], base, "tptc_assignment", title, body, link);

  await pushStaffNotification({
    recipientIds: [input.assigneeUserId],
    actorUserId: input.actorUserId,
    title,
    body,
    link,
    tag: `tptc-assignment-${input.assignmentId}`,
  });
}

/**
 * Event — KS xác nhận đã đọc + sẽ thực hiện việc TPTC giao.
 * Recipients: assigner gốc + tất cả TPTC khác (dedupe).
 */
export async function notifyTptcAssignmentAcknowledged(input: {
  projectId: string;
  assignmentId: string;
  assignerUserId: string;
  actorUserId: string;
  actorName: string;
  title: string;
}) {
  const project = await getProjectContext(input.projectId);
  if (!project) return;

  const tptcIds = await getTptcUserIds();
  const recipients = Array.from(new Set([input.assignerUserId, ...tptcIds]));

  const title = `KS ${input.actorName} đã nhận việc: ${input.title}`;
  const body = "Đã xác nhận sẽ thực hiện";
  const link = "/tptc/assignments";

  const base: NotifyInput = {
    projectId: input.projectId,
    actorUserId: input.actorUserId,
    actorName: input.actorName,
    refType: "tptc_assignment",
    refId: input.assignmentId,
  };

  await createStaffNotifications(recipients, base, "ks_tptc_acknowledged", title, body, link);

  await pushStaffNotification({
    recipientIds: recipients,
    actorUserId: input.actorUserId,
    title,
    body,
    link,
    tag: `tptc-ack-${input.assignmentId}`,
  });
}

/**
 * Event — KS báo cáo xong việc TPTC giao.
 * Recipients: assigner gốc + tất cả TPTC khác (dedupe).
 */
export async function notifyTptcAssignmentCompleted(input: {
  projectId: string;
  assignmentId: string;
  assignerUserId: string;
  actorUserId: string;
  actorName: string;
  title: string;
  ksNote: string | null;
}) {
  const project = await getProjectContext(input.projectId);
  if (!project) return;

  const tptcIds = await getTptcUserIds();
  const recipients = Array.from(new Set([input.assignerUserId, ...tptcIds]));

  const title = `KS ${input.actorName} báo xong: ${input.title}`;
  const body = input.ksNote || "Đã hoàn thành, chờ TPTC duyệt";
  const link = "/tptc/assignments";

  const base: NotifyInput = {
    projectId: input.projectId,
    actorUserId: input.actorUserId,
    actorName: input.actorName,
    refType: "tptc_assignment",
    refId: input.assignmentId,
  };

  await createStaffNotifications(recipients, base, "tptc_assignment", title, body, link);

  await pushStaffNotification({
    recipientIds: recipients,
    actorUserId: input.actorUserId,
    title,
    body,
    link,
    tag: `tptc-done-${input.assignmentId}`,
  });
}

/**
 * Event — KS cập nhật trạng thái hôm nay cho TPTC assignment (working_on_today / not_today).
 * Recipient: assigner + tất cả TPTC users. Dedupe push tag per assignment+date+status.
 */
export async function notifyTptcAssignmentDailyStatus(input: {
  projectId: string;
  assignmentId: string;
  assignerUserId: string;
  actorUserId: string;
  actorName: string;
  title: string;
  status: "working_on_today" | "not_today";
  note: string | null;
  reportDateIso: string;
}) {
  const project = await getProjectContext(input.projectId);
  if (!project) return;

  const tptcIds = await getTptcUserIds();
  const recipients = Array.from(new Set([input.assignerUserId, ...tptcIds]));

  const verb = input.status === "working_on_today" ? "đang làm" : "chưa làm";
  const title = `KS ${input.actorName} ${verb} hôm nay: ${input.title}`;
  const body =
    input.status === "not_today"
      ? input.note || "KS chưa làm hôm nay (không có lý do)"
      : input.note || "KS đang làm hôm nay";
  const link = "/tptc/assignments";

  const base: NotifyInput = {
    projectId: input.projectId,
    actorUserId: input.actorUserId,
    actorName: input.actorName,
    refType: "tptc_assignment",
    refId: input.assignmentId,
  };

  await createStaffNotifications(recipients, base, "tptc_assignment", title, body, link);

  await pushStaffNotification({
    recipientIds: recipients,
    actorUserId: input.actorUserId,
    title,
    body,
    link,
    tag: `tptc-daily-${input.assignmentId}-${input.reportDateIso}-${input.status}`,
  });
}

/**
 * Event — TPTC duyệt hoặc reject việc giao cho KS.
 * Recipient: KS assignee.
 */
export async function notifyTptcAssignmentReviewed(input: {
  projectId: string;
  assignmentId: string;
  assigneeUserId: string;
  actorUserId: string;
  actorName: string;
  title: string;
  decision: "approved" | "rejected";
  reviewNote: string | null;
}) {
  const project = await getProjectContext(input.projectId);
  if (!project) return;

  const title =
    input.decision === "approved"
      ? `TPTC ${input.actorName} đã duyệt: ${input.title}`
      : `TPTC ${input.actorName} yêu cầu làm lại: ${input.title}`;
  const body = input.reviewNote || (input.decision === "approved" ? "Việc đã được duyệt" : "Cần làm lại theo phản hồi");
  const link = `/reports?ackTptc=${input.assignmentId}`;

  const base: NotifyInput = {
    projectId: input.projectId,
    actorUserId: input.actorUserId,
    actorName: input.actorName,
    refType: "tptc_assignment",
    refId: input.assignmentId,
  };

  await createStaffNotifications([input.assigneeUserId], base, "tptc_assignment", title, body, link);

  await pushStaffNotification({
    recipientIds: [input.assigneeUserId],
    actorUserId: input.actorUserId,
    title,
    body,
    link,
    tag: `tptc-review-${input.assignmentId}-${input.decision}`,
  });
}

/**
 * Event — TPTC nhắc KS làm việc gấp.
 * Recipient: assignee KS. Push tag distinct theo timestamp để OS không dedupe các lần nhắc liên tiếp.
 */
export async function notifyTptcRemind(input: {
  projectId: string;
  assignmentId: string;
  assigneeUserId: string;
  actorUserId: string;
  actorName: string;
  title: string;
}) {
  const project = await getProjectContext(input.projectId);
  if (!project) return;

  const title = `[Nhắc Việc từ TPTC] cần báo cáo nhiệm vụ "${input.title}"`;
  const body = `${input.actorName} nhắc bạn`;
  const link = `/reports?ackTptc=${input.assignmentId}`;

  const base: NotifyInput = {
    projectId: input.projectId,
    actorUserId: input.actorUserId,
    actorName: input.actorName,
    refType: "tptc_assignment",
    refId: input.assignmentId,
  };

  await createStaffNotifications([input.assigneeUserId], base, "tptc_assignment", title, body, link);

  await pushStaffNotification({
    recipientIds: [input.assigneeUserId],
    actorUserId: input.actorUserId,
    title,
    body,
    link,
    tag: `tptc-remind-${input.assignmentId}-${Date.now()}`,
  });
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
