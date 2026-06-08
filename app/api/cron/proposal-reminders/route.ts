import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { notifyMaterialProposalReminder } from "@/lib/notify-material-proposal";

export const runtime = "nodejs";

const REMINDER_INTERVAL_MS = 5 * 60 * 1000;

export async function POST(request: Request) {
  const key = request.headers.get("x-cron-key");
  if (!key || key !== process.env.PUSH_CRON_KEY) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();

  const due = await prisma.materialProposal.findMany({
    where: {
      status: "accepted",
      orderStatus: "not_ordered",
      reminderDueAt: { lte: now, not: null },
    },
    select: {
      id: true,
      projectId: true,
      description: true,
      project: { select: { name: true } },
      ks: { select: { fullName: true } },
    },
    take: 100,
  });

  if (due.length === 0) {
    return NextResponse.json({ fired: 0 });
  }

  const accountants = await prisma.user.findMany({
    where: { OR: [{ role: "accountant" }, { role: "admin" }], isActive: true },
    select: { id: true },
  });
  const recipientIds = accountants.map((a) => a.id);

  let fired = 0;
  for (const p of due) {
    try {
      await notifyMaterialProposalReminder({
        proposalId: p.id,
        projectId: p.projectId,
        projectName: p.project.name,
        ksName: p.ks.fullName,
        description: p.description,
        recipientIds,
      });
      await prisma.materialProposal.update({
        where: { id: p.id },
        data: { reminderDueAt: new Date(now.getTime() + REMINDER_INTERVAL_MS) },
      });
      fired += 1;
    } catch (err) {
      console.error("[cron.proposal-reminders] err", p.id, err);
    }
  }

  return NextResponse.json({ fired, due: due.length });
}
