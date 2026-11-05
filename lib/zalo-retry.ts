/**
 * GỬI LẠI tin Zalo cho chủ nhà / đội khoán khi gửi lỗi (luật sếp Zalo 21:13 04/11/2026, việc V261104-211426):
 *  - Lỗi → máy gửi lại 3 lần, cách nhau 5 phút.
 *  - Hết 3 lần vẫn lỗi → báo TP Dự án – Thi công để biết / theo dõi (không nhắn KS, không kèm link gửi tay —
 *    SOP-20 C12, SOP-23 luật 26); máy vẫn gửi lại mỗi giờ 1 lần cho tới khi gửi được.
 *  - Tin đã tới khách bằng đường khác trong ERP → thôi gửi, không gửi trùng.
 *  - Quá 24 giờ chưa gửi được → bản tin CEO (văn phòng AI đọc bảng zalo_retries).
 * Quét theo cron mỗi phút (/api/cron/push-reminders gọi runZaloRetries).
 */
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { lookupZaloUserByPhone, sendZaloBridge } from "@/lib/zalo-notify";
import { sendPushToUser } from "@/lib/push-server";

export type ZaloRetryKind = "bb_party" | "receipt_customer" | "diary_link";
/** sent = đã tới khách · failed = vẫn lỗi (note lý do) · cancel = không cần gửi nữa (BB đã ký/huỷ…). */
export type RetryOutcome = { r: "sent" } | { r: "failed"; note: string } | { r: "cancel" };

const FAST_TRIES = 3; // số lần gửi lại cách 5 phút
const FAST_MIN = 5;
const SLOW_MIN = 60;
const LEASE_MIN = 10; // khoá dòng đang gửi (gửi PDF có thể mất ~2 phút) để lượt cron sau không gửi trùng
const BATCH = 10;

/** tries = số lần đã gửi (cả lần đầu). Lần đầu + 3 lần nhanh = 4 → từ đó mỗi giờ. */
function nextDelayMin(tries: number) {
  return tries <= FAST_TRIES ? FAST_MIN : SLOW_MIN;
}

const addMin = (d: Date, m: number) => new Date(d.getTime() + m * 60_000);

/**
 * Lần gửi đầu bị lỗi → đưa vào hàng chờ gửi lại (đã có dòng pending cùng tin thì cập nhật, không tạo trùng).
 * Không bao giờ ném lỗi ra luồng gọi.
 */
export async function enqueueZaloRetry(input: {
  kind: ZaloRetryKind;
  refId: string;
  ev: string;
  projectId?: string | null;
  recipient?: string | null;
  message: string;
  withFile?: boolean;
  link?: string | null;
  error: string;
}): Promise<void> {
  try {
    const now = new Date();
    const cur = await prisma.zaloRetry.findFirst({
      where: { kind: input.kind, refId: input.refId, ev: input.ev, status: "pending" },
      select: { id: true },
    });
    if (cur) {
      await prisma.zaloRetry.update({
        where: { id: cur.id },
        data: { message: input.message, link: input.link ?? null, lastError: input.error },
      });
      return;
    }
    await prisma.zaloRetry.create({
      data: {
        kind: input.kind,
        refId: input.refId,
        ev: input.ev,
        projectId: input.projectId ?? null,
        recipient: input.recipient ?? null,
        message: input.message,
        withFile: !!input.withFile,
        link: input.link ?? null,
        tries: 1,
        nextAt: addMin(now, nextDelayMin(1)),
        lastError: input.error,
      },
    });
  } catch (err) {
    console.error("[zalo-retry] không ghi được hàng chờ gửi lại:", err);
  }
}

/** Tin đã gửi được (vd gửi lại lúc KS ký) → đóng các dòng chờ của tin đó. */
export async function markZaloRetrySent(kind: ZaloRetryKind, refId: string, ev: string) {
  await prisma.zaloRetry
    .updateMany({ where: { kind, refId, ev, status: "pending" }, data: { status: "sent", sentAt: new Date() } })
    .catch((err) => console.error("[zalo-retry] đóng dòng chờ lỗi:", err));
}

async function attempt(row: { kind: string; refId: string; ev: string; message: string; withFile: boolean; createdAt: Date }): Promise<RetryOutcome> {
  if (row.kind === "bb_party") {
    const { retryEsignPartySend } = await import("@/lib/acceptance-esign");
    return retryEsignPartySend(row.refId, row.ev, row.message, row.withFile, row.createdAt);
  }
  if (row.kind === "receipt_customer") {
    const { retryReceiptCustomerSend } = await import("@/lib/zalo-notify");
    return retryReceiptCustomerSend(row.refId, row.message);
  }
  if (row.kind === "diary_link") {
    const { retryCustomerDiaryLinkSend } = await import("@/lib/customer-diary-link");
    return retryCustomerDiaryLinkSend(row.refId);
  }
  return { r: "cancel" };
}

/** Quét các tin đến giờ gửi lại. Gọi mỗi phút từ cron; không ném lỗi. */
export async function runZaloRetries(): Promise<{ sent: number; failed: number; cancelled: number; escalated: number }> {
  const out = { sent: 0, failed: 0, cancelled: 0, escalated: 0 };
  const now = new Date();
  const due = await prisma.zaloRetry.findMany({
    where: { status: "pending", nextAt: { lte: now } },
    orderBy: { nextAt: "asc" },
    take: BATCH,
  });
  for (const row of due) {
    // Giành dòng: lượt cron khác đã lấy thì bỏ qua.
    const claim = await prisma.zaloRetry.updateMany({
      where: { id: row.id, status: "pending", nextAt: row.nextAt },
      data: { nextAt: addMin(now, LEASE_MIN) },
    });
    if (!claim.count) continue;

    let res: RetryOutcome;
    try {
      res = await attempt(row);
    } catch (err) {
      res = { r: "failed", note: err instanceof Error ? err.message.slice(0, 300) : "lỗi" };
    }
    const tries = row.tries + 1;
    const at = new Date();
    if (res.r === "sent") {
      await prisma.zaloRetry.update({ where: { id: row.id }, data: { status: "sent", tries, sentAt: at } });
      out.sent++;
      continue;
    }
    if (res.r === "cancel") {
      await prisma.zaloRetry.update({ where: { id: row.id }, data: { status: "cancelled", tries: row.tries } });
      out.cancelled++;
      continue;
    }
    const escalate = tries > FAST_TRIES && !row.escalatedAt;
    await prisma.zaloRetry.update({
      where: { id: row.id },
      data: {
        tries,
        lastError: res.note,
        nextAt: addMin(at, nextDelayMin(tries)),
        escalatedAt: escalate ? at : row.escalatedAt,
      },
    });
    out.failed++;
    if (escalate) {
      try {
        await escalateZaloRetry({ ...row, tries, lastError: res.note });
        out.escalated++;
      } catch (err) {
        console.error("[zalo-retry] báo cấp trên lỗi:", err);
      }
    }
  }
  return out;
}

/**
 * Hết 3 lần gửi lại nhanh vẫn lỗi → báo TP Dự án – Thi công (user construction_manager) qua Zalo + thông báo app
 * để biết / theo dõi. Không kèm link / nội dung để gửi tay, không nhắn KS: chỉ máy gửi lại (SOP-20 C11, C12).
 * TP chưa có Zalo → chỉ thông báo app; KHÔNG đẩy về Zalo văn phòng/sếp — dòng đã báo (escalated_at) vào
 * bản tin CEO (sếp 21:07 04/11).
 */
async function escalateZaloRetry(row: {
  projectId: string | null;
  recipient: string | null;
  tries: number;
  lastError: string | null;
}) {
  const project = row.projectId
    ? await prisma.project.findUnique({ where: { id: row.projectId }, select: { code: true, name: true } })
    : null;
  const users = await prisma.user.findMany({
    where: { isActive: true, role: UserRole.construction_manager },
    select: { id: true, phone: true, zaloThreadId: true },
  });

  const where = project ? `${project.code} — ${project.name}` : "";
  const text =
    `⚠️ Gửi Zalo cho ${row.recipient ?? "khách"}${where ? ` (${where})` : ""} lỗi ${row.tries} lần ` +
    `(lần đầu + ${row.tries - 1} lần gửi lại cách 5 phút). Lỗi: ${row.lastError ?? "?"}.\n` +
    `Máy vẫn tự gửi lại mỗi giờ 1 lần cho tới khi gửi được. Báo để anh biết và theo dõi.`;

  for (const u of users) {
    const thread = u.zaloThreadId ?? (u.phone ? await lookupZaloUserByPhone(u.phone) : null);
    if (thread) await sendZaloBridge({ threadId: thread, text });
    await sendPushToUser(u.id, {
      title: `⚠️ Chưa gửi được Zalo cho ${row.recipient ?? "khách"}`,
      body: "Máy gửi lại 3 lần vẫn lỗi, đang tự gửi lại mỗi giờ.",
      url: "/",
      requireInteraction: true,
    }).catch(() => undefined);
  }
}
