/**
 * "Việc cần làm" của kế toán — dùng chung cho launcher /ketoan (thu-chi-summary)
 * và cron nhắc Zalo mỗi 2 tiếng (8h→20h).
 *
 *  - Việc tự sinh: lệnh chi chờ chuyển, lệnh thu chờ nhận, đơn chưa nhận, đơn cần trả ngay.
 *  - Việc admin giao (accountant_tasks): AI tạo theo tin nhắn anh; KT tick xong trên launcher.
 */
import { prisma } from "@/lib/prisma";

export type ProjectCount = { projectId: string; projectName: string; count: number };

export type KetoanAutoTodos = {
  expensePending: number;
  receiptPending: number;
  pendingOrders: ProjectCount[];
  payNowOrders: ProjectCount[];
};

export type AccountantTaskDto = {
  id: string;
  title: string;
  note: string | null;
  dueDate: string | null;
  status: string;
  createdByName: string | null;
  createdAt: string;
  doneAt: string | null;
};

export async function getKetoanAutoTodos(): Promise<KetoanAutoTodos> {
  const [expensePending, receiptPending, pendingOrderGroups, payNowRaw] = await Promise.all([
    prisma.expense.count({ where: { status: "pending" } }),
    prisma.receipt.count({ where: { status: "pending" } }),
    // Đơn hàng đã đặt NCC nhưng CHƯA nhận (status=ordered) — gộp theo dự án để link trực tiếp.
    prisma.mhOrder.groupBy({
      by: ["projectId"],
      where: { status: "ordered" },
      _count: { _all: true },
    }),
    // Đơn "thanh toán ngay" (không NCC) ĐÃ NHẬN → KT cần gửi lệnh chi. Lọc đơn đã gửi ở dưới.
    prisma.mhOrder.findMany({
      where: { status: "received", supplierId: null },
      select: { id: true, projectId: true },
    }),
  ]);

  // Loại đơn trả ngay đã có lệnh chi đang chờ (nằm ở todo "Lệnh chi chờ chuyển") → tránh đếm trùng.
  const payNowIds = payNowRaw.map((o) => o.id);
  const payNowInflight = payNowIds.length
    ? await prisma.expense.findMany({
        where: {
          sourceType: "mua_hang_order",
          sourceId: { in: payNowIds },
          status: { in: ["tptc_pending", "pending"] },
        },
        select: { sourceId: true },
      })
    : [];
  const payNowInflightSet = new Set(payNowInflight.map((e) => e.sourceId));
  const payNowByProj = new Map<string, number>();
  for (const o of payNowRaw) {
    if (payNowInflightSet.has(o.id)) continue;
    payNowByProj.set(o.projectId, (payNowByProj.get(o.projectId) || 0) + 1);
  }

  // Gắn tên dự án cho các nhóm đơn (chưa nhận + trả ngay cần chi) — fetch tên 1 lần.
  const allProjIds = Array.from(
    new Set([...pendingOrderGroups.map((g) => g.projectId), ...Array.from(payNowByProj.keys())]),
  );
  const namedProjects = allProjIds.length
    ? await prisma.project.findMany({
        where: { id: { in: allProjIds } },
        select: { id: true, name: true },
      })
    : [];
  const projNameById = new Map(namedProjects.map((p) => [p.id, p.name]));
  const pendingOrders = pendingOrderGroups
    .map((g) => ({
      projectId: g.projectId,
      projectName: projNameById.get(g.projectId) || "Dự án",
      count: g._count._all,
    }))
    .sort((a, b) => b.count - a.count);
  const payNowOrders = Array.from(payNowByProj.entries())
    .map(([projectId, count]) => ({
      projectId,
      projectName: projNameById.get(projectId) || "Dự án",
      count,
    }))
    .sort((a, b) => b.count - a.count);

  return { expensePending, receiptPending, pendingOrders, payNowOrders };
}

type TaskRow = {
  id: string;
  title: string;
  note: string | null;
  dueDate: Date | null;
  status: string;
  createdByName: string | null;
  createdAt: Date;
  doneAt: Date | null;
};

export function toTaskDto(t: TaskRow): AccountantTaskDto {
  return {
    id: t.id,
    title: t.title,
    note: t.note,
    dueDate: t.dueDate ? t.dueDate.toISOString().slice(0, 10) : null,
    status: t.status,
    createdByName: t.createdByName,
    createdAt: t.createdAt.toISOString(),
    doneAt: t.doneAt ? t.doneAt.toISOString() : null,
  };
}

/** Việc admin giao còn mở — hạn gần trước, không hạn xuống cuối. */
export async function getOpenAccountantTasks(): Promise<AccountantTaskDto[]> {
  const rows = await prisma.accountantTask.findMany({
    where: { status: "open" },
    orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
  });
  return rows.map(toTaskDto);
}

function fmtDdMm(isoDate: string): string {
  const [, m, d] = isoDate.split("-");
  return `${d}/${m}`;
}

/**
 * Soạn tin Zalo nhắc việc. null = không còn việc gì → cron không gửi.
 * Kế toán không mở được PWA từ webview Zalo → chỉ text, không link.
 */
export function buildKetoanReminderText(
  auto: KetoanAutoTodos,
  tasks: AccountantTaskDto[],
  now = new Date(),
): string | null {
  const autoLines: string[] = [];
  if (auto.expensePending > 0) autoLines.push(`• Lệnh chi chờ chuyển: ${auto.expensePending}`);
  if (auto.receiptPending > 0) autoLines.push(`• Lệnh thu chờ nhận: ${auto.receiptPending}`);
  for (const o of auto.pendingOrders) autoLines.push(`• Đơn chưa nhận · ${o.projectName}: ${o.count}`);
  for (const o of auto.payNowOrders) autoLines.push(`• Cần thanh toán ngay · ${o.projectName}: ${o.count}`);

  if (autoLines.length === 0 && tasks.length === 0) return null;

  const todayIso = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(now);
  const hhmm = new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
  }).format(now);

  const parts: string[] = [`📋 VIỆC CẦN LÀM (${hhmm} ${fmtDdMm(todayIso)})`];
  if (autoLines.length) parts.push("", ...autoLines);
  if (tasks.length) {
    parts.push("", `📝 Việc anh giao (${tasks.length}):`);
    tasks.forEach((t, i) => {
      let due = "";
      if (t.dueDate) {
        due = t.dueDate < todayIso ? ` ⚠️ quá hạn ${fmtDdMm(t.dueDate)}` : ` (hạn ${fmtDdMm(t.dueDate)})`;
      }
      parts.push(`${i + 1}. ${t.title}${due}`);
    });
  }
  parts.push("", "Xong việc nào thì tick ✓ trên ERP mục Kế toán → Việc cần làm.");
  return parts.join("\n");
}
