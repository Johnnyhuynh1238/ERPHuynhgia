import fs from "node:fs";
import path from "node:path";
import "dotenv/config";
import { PrismaClient, QcReviewAction, TaskLogType, TaskStatus, UserRole } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("Thiếu DATABASE_URL");

const pool = new Pool({ connectionString: databaseUrl });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

type AffectedRecord = {
  taskId: string;
  projectId: string;
  taskCode: string;
  fromStatus: TaskStatus;
  toStatus: TaskStatus;
  reasonLabel: "normalize_done_qc_approved" | "normalize_done_no_qc_approved";
};

async function resolveActorUserId() {
  const envActor = process.env.NORMALIZE_ACTOR_USER_ID;
  if (envActor) {
    const user = await prisma.user.findUnique({ where: { id: envActor }, select: { id: true, isActive: true } });
    if (!user || !user.isActive) {
      throw new Error("NORMALIZE_ACTOR_USER_ID không tồn tại hoặc không active");
    }
    return user.id;
  }

  const fallback = await prisma.user.findFirst({
    where: {
      isActive: true,
      role: { in: [UserRole.admin, UserRole.construction_manager] },
    },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });

  if (!fallback) {
    throw new Error("Không tìm thấy user admin/construction_manager để ghi task_logs");
  }

  return fallback.id;
}

async function main() {
  const actorUserId = await resolveActorUserId();

  const doneTasks = await prisma.task.findMany({
    where: { status: TaskStatus.done },
    select: {
      id: true,
      projectId: true,
      code: true,
      status: true,
    },
    orderBy: [{ projectId: "asc" }, { code: "asc" }],
  });

  if (doneTasks.length === 0) {
    const now = new Date();
    const outDir = path.join(process.cwd(), "output", "reports");
    fs.mkdirSync(outDir, { recursive: true });
    const reportPath = path.join(outDir, `normalize-task-status-${now.toISOString().replace(/[.:]/g, "-")}.json`);
    const report = {
      generatedAt: now.toISOString(),
      actorUserId,
      scannedDoneTasks: 0,
      updatedToInspected: 0,
      updatedToInProgress: 0,
      affected: [] as AffectedRecord[],
    };
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
    console.log(`REPORT_PATH=${reportPath}`);
    return;
  }

  const doneTaskIds = doneTasks.map((t) => t.id);
  const approvedRows = await prisma.qcReview.findMany({
    where: {
      taskId: { in: doneTaskIds },
      action: QcReviewAction.approved,
    },
    select: { taskId: true },
    distinct: ["taskId"],
  });

  const approvedTaskIdSet = new Set(approvedRows.map((r) => r.taskId));
  const affected: AffectedRecord[] = [];

  for (const task of doneTasks) {
    const hasApprovedQc = approvedTaskIdSet.has(task.id);
    const toStatus = hasApprovedQc ? TaskStatus.inspected : TaskStatus.in_progress;
    const reasonLabel = hasApprovedQc ? "normalize_done_qc_approved" : "normalize_done_no_qc_approved";

    await prisma.$transaction(async (tx) => {
      await tx.task.update({
        where: { id: task.id },
        data: { status: toStatus },
      });

      await tx.taskLog.create({
        data: {
          taskId: task.id,
          userId: actorUserId,
          logType: TaskLogType.status_change,
          oldValue: task.status,
          newValue: toStatus,
          content: `AUTO_STATUS: ${task.status} -> ${toStatus} (${reasonLabel})`,
        },
      });
    });

    affected.push({
      taskId: task.id,
      projectId: task.projectId,
      taskCode: task.code,
      fromStatus: task.status,
      toStatus,
      reasonLabel,
    });
  }

  const updatedToInspected = affected.filter((r) => r.toStatus === TaskStatus.inspected).length;
  const updatedToInProgress = affected.filter((r) => r.toStatus === TaskStatus.in_progress).length;

  const now = new Date();
  const outDir = path.join(process.cwd(), "output", "reports");
  fs.mkdirSync(outDir, { recursive: true });
  const reportPath = path.join(outDir, `normalize-task-status-${now.toISOString().replace(/[.:]/g, "-")}.json`);

  const report = {
    generatedAt: now.toISOString(),
    actorUserId,
    scannedDoneTasks: doneTasks.length,
    updatedToInspected,
    updatedToInProgress,
    affected,
  };

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
  console.log(`REPORT_PATH=${reportPath}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
