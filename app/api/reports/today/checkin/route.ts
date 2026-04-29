import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { getTodayDateVn } from "@/lib/task-centric";
import { prisma } from "@/lib/prisma";
import { upsertTechnicalReport } from "@/lib/task-report-service";

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user?.id) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    const body = await req.json();
    const taskIds: string[] = Array.isArray(body.taskIds) ? body.taskIds : [];
    const today = getTodayDateVn();

    for (const taskId of taskIds) {
      await upsertTechnicalReport(taskId, user.id, { status: "working" }, today);
      await prisma.task.updateMany({ where: { id: taskId, status: "not_started" }, data: { status: "in_progress", actualStartDate: today } });
    }

    return NextResponse.json({ ok: true, count: taskIds.length });
  } catch (e: any) {
    return NextResponse.json({ message: e.message || "Failed" }, { status: 500 });
  }
}
