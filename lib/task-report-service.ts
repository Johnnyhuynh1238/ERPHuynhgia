import { ReportPhotoType, TechnicalReportStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getTodayDateVn } from "@/lib/task-centric";

export async function getTaskProject(taskId: string) {
  return prisma.task.findUnique({ where: { id: taskId }, select: { id: true, projectId: true, status: true, actualStartDate: true } });
}

export async function upsertTechnicalReport(taskId: string, userId: string, data: any, reportDate?: Date) {
  const date = reportDate ?? getTodayDateVn();
  const report = await prisma.taskTechnicalReport.upsert({
    where: { taskId_reportDate: { taskId, reportDate: date } },
    create: {
      taskId,
      reportDate: date,
      status: (data.status as TechnicalReportStatus) || TechnicalReportStatus.working,
      pauseReason: data.pauseReason || null,
      technicalIssue: data.technicalIssue || null,
      note: data.note || null,
      createdBy: userId,
      updatedBy: userId,
    },
    update: {
      status: (data.status as TechnicalReportStatus) || undefined,
      pauseReason: data.pauseReason ?? undefined,
      technicalIssue: data.technicalIssue ?? undefined,
      note: data.note ?? undefined,
      updatedBy: userId,
    },
  });

  if (report.status === "working") {
    const task = await prisma.task.findUnique({ where: { id: taskId }, select: { status: true, actualStartDate: true } });
    if (task?.status === "not_started") {
      await prisma.task.update({ where: { id: taskId }, data: { status: "in_progress", actualStartDate: task.actualStartDate ?? date } });
    }
  }
  if (report.status === "completed") {
    const progress = await prisma.qcProgress.findMany({ where: { taskId }, select: { status: true } });
    const allPassed = progress.length > 0 && progress.every((x) => x.status === "passed");
    if (!allPassed) throw new Error("Cần hoàn thành tất cả QC trước khi mark task done");
    await prisma.task.update({ where: { id: taskId }, data: { status: "done", actualEndDate: date } });
  }

  return report;
}

export async function upsertMaterialReport(taskId: string, userId: string, data: any, reportDate?: Date) {
  const date = reportDate ?? getTodayDateVn();
  return prisma.taskMaterialReport.upsert({
    where: { taskId_reportDate: { taskId, reportDate: date } },
    create: { taskId, reportDate: date, note: data.note || null, hasIssue: Boolean(data.hasIssue), issueDescription: data.issueDescription || null, createdBy: userId, updatedBy: userId },
    update: { note: data.note ?? undefined, hasIssue: typeof data.hasIssue === "boolean" ? data.hasIssue : undefined, issueDescription: data.issueDescription ?? undefined, updatedBy: userId },
  });
}

export async function upsertLaborReport(taskId: string, userId: string, data: any, reportDate?: Date) {
  const date = reportDate ?? getTodayDateVn();
  return prisma.taskLaborReport.upsert({
    where: { taskId_reportDate: { taskId, reportDate: date } },
    create: { taskId, reportDate: date, masterWorkerCount: data.masterWorkerCount ?? null, helperCount: data.helperCount ?? null, note: data.note || null, createdBy: userId, updatedBy: userId },
    update: { masterWorkerCount: data.masterWorkerCount ?? undefined, helperCount: data.helperCount ?? undefined, note: data.note ?? undefined, updatedBy: userId },
  });
}

export async function upsertEquipmentReport(taskId: string, userId: string, data: any, reportDate?: Date) {
  const date = reportDate ?? getTodayDateVn();
  return prisma.taskEquipmentReport.upsert({
    where: { taskId_reportDate: { taskId, reportDate: date } },
    create: { taskId, reportDate: date, note: data.note || null, createdBy: userId, updatedBy: userId },
    update: { note: data.note ?? undefined, updatedBy: userId },
  });
}

export async function addReportPhoto(reportId: string, taskId: string, uploadedBy: string, fileUrl: string, caption: string | null, type: ReportPhotoType) {
  return prisma.taskReportPhoto.create({
    data: {
      taskId,
      reportDate: getTodayDateVn(),
      type,
      technicalReportId: type === "technical" ? reportId : null,
      fileUrl,
      caption,
      uploadedBy,
    },
  });
}
