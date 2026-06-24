import { NextResponse } from "next/server";
import { ExpenseStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/push-server";
import { nextReminderForPriority } from "@/lib/expense-reminder";

export const runtime = "nodejs";

function fmtVnd(n: number) {
  return new Intl.NumberFormat("vi-VN").format(Math.round(n)) + " đ";
}

export async function POST(request: Request) {
  const key = request.headers.get("x-cron-key");
  if (!key || key !== process.env.PUSH_CRON_KEY) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();

  const due = await prisma.expense.findMany({
    where: {
      status: ExpenseStatus.pending,
      nextReminderAt: { lte: now, not: null },
    },
    select: {
      id: true,
      code: true,
      amount: true,
      priority: true,
      payee: true,
      category: { select: { name: true } },
      project: { select: { code: true, name: true } },
    },
    take: 100,
  });

  if (due.length === 0) {
    return NextResponse.json({ fired: 0 });
  }

  const accountants = await prisma.user.findMany({
    where: { role: "accountant", isActive: true },
    select: { id: true },
  });
  const recipientIds = accountants.map((a) => a.id);

  if (recipientIds.length === 0) {
    return NextResponse.json({ fired: 0, skipped: "no_accountants" });
  }

  let fired = 0;
  for (const e of due) {
    const projectLabel = e.project ? ` (${e.project.code})` : "";
    const prefix = e.priority === "urgent" ? "🚨 GẤP" : "Nhắc";
    const title = `${prefix} chi ${e.code} — ${fmtVnd(Number(e.amount))}`;
    const body = `${e.category.name}${e.payee ? ` · ${e.payee}` : ""}${projectLabel}`;
    const link = `/expenses?id=${e.id}`;
    const tag = `expense-remind-${e.id}-${now.getTime()}`;

    try {
      const badgeCounts = await Promise.all(
        recipientIds.map((id) =>
          prisma.staffNotification.count({ where: { recipientId: id, isRead: false } }),
        ),
      );
      await Promise.all(
        recipientIds.map((id, idx) =>
          sendPushToUser(id, { title, body, url: link, tag, badgeCount: badgeCounts[idx] }).catch(
            (err) => console.error("[expense-reminders] push fail", id, err),
          ),
        ),
      );
      await prisma.expense.update({
        where: { id: e.id },
        data: { nextReminderAt: nextReminderForPriority(e.priority, now) },
      });
      fired += 1;
    } catch (err) {
      console.error("[expense-reminders] err", e.id, err);
    }
  }

  return NextResponse.json({ fired, due: due.length });
}
