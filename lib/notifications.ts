import { prisma } from "@/lib/prisma";
import type { Prisma, StaffNotificationKind, CustomerNotificationKind } from "@prisma/client";

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
    select: { id: true, mainEngineerId: true, customerPortalEnabled: true },
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

  await Promise.all([
    createStaffNotifications(tptcIds, base, "ks_morning_checkin", title, body, `/projects/${input.projectId}/tasks?filter=today`),
    project.customerPortalEnabled
      ? createCustomerNotification(base, "ks_morning_checkin", title, body, `/timeline?filter=today`)
      : Promise.resolve(),
  ]);
}

/**
 * Event B — KS cập nhật tiến độ task (status / photo / progress / meta / check-out).
 * Recipients: TPTC luôn; Chủ nhà chỉ khi portal bật và task visibleToCustomer.
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

  await Promise.all([
    createStaffNotifications(tptcIds, base, "ks_task_update", title, body, `/tasks/${input.taskId}`),
    shouldNotifyCustomer
      ? createCustomerNotification(base, "ks_task_update", title, body, `/tasks/${input.taskId}`)
      : Promise.resolve(),
  ]);
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
