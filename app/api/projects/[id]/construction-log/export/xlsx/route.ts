import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { parseYmdToUtcDate, toUtcEndOfDay, toUtcStartOfDay } from "@/lib/date";
import { prisma } from "@/lib/prisma";
import { buildProjectAccessWhere } from "@/lib/project-permissions";

function formatDate(value: Date | null) {
  if (!value) return "-";
  const d = String(value.getUTCDate()).padStart(2, "0");
  const m = String(value.getUTCMonth() + 1).padStart(2, "0");
  const y = value.getUTCFullYear();
  return `${d}/${m}/${y}`;
}

function formatSubmit(value: Date | null, isOnTime: boolean | null) {
  if (!value) return "-";
  const hh = String(value.getHours()).padStart(2, "0");
  const mm = String(value.getMinutes()).padStart(2, "0");
  return `${hh}:${mm} ${isOnTime ? "✓" : "(trễ)"}`;
}

function normalizeRange(fromInput: string | null, toInput: string | null) {
  const now = new Date();
  const fallbackTo = toUtcStartOfDay(now);
  const fallbackFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 30, 0, 0, 0));

  const from = fromInput && /^\d{4}-\d{2}-\d{2}$/.test(fromInput) ? parseYmdToUtcDate(fromInput) : fallbackFrom;
  const to = toInput && /^\d{4}-\d{2}-\d{2}$/.test(toInput) ? parseYmdToUtcDate(toInput) : fallbackTo;

  return {
    from: toUtcStartOfDay(from <= to ? from : to),
    to: toUtcEndOfDay(to >= from ? to : from),
  };
}

function dateKeyOf(value: Date) {
  return value.toISOString().slice(0, 10);
}

function ratingLabel(value: "MET" | "UNDER" | "OVER" | null | undefined) {
  if (value === "MET") return "Đạt kế hoạch";
  if (value === "OVER") return "Vượt kế hoạch";
  if (value === "UNDER") return "Không đạt kế hoạch";
  return "-";
}

function pauseStateLabel(value: boolean | null) {
  if (value === true) return "Vẫn tạm dừng";
  if (value === false) return "Đã bắt đầu lại";
  return "-";
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }

  if (user.role === UserRole.accountant) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const project = await prisma.project.findFirst({
    where: {
      id: params.id,
      ...buildProjectAccessWhere({ id: user.id, role: user.role }),
    },
    select: {
      id: true,
      code: true,
      name: true,
    },
  });

  if (!project) {
    return NextResponse.json({ message: "Không tìm thấy dự án" }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const { from, to } = normalizeRange(searchParams.get("from"), searchParams.get("to"));

  const whereBase = {
    projectId: params.id,
    reportDate: { gte: from, lte: to },
  };

  const [morningReports, eveningReports] = await Promise.all([
    prisma.morningReport.findMany({
      where: whereBase,
      include: {
        reporter: { select: { id: true, fullName: true } },
        taskReports: {
          select: {
            taskId: true,
            decision: true,
            plannedActivity: true,
            pauseReason: true,
            pauseNote: true,
            task: {
              select: {
                code: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: { reportDate: "desc" },
    }),
    prisma.eveningReport.findMany({
      where: whereBase,
      include: {
        reporter: { select: { id: true, fullName: true } },
        taskReports: {
          include: {
            task: {
              select: {
                id: true,
                code: true,
                name: true,
              },
            },
            taskPhotos: {
              select: {
                id: true,
                photoUrl: true,
                caption: true,
              },
            },
          },
        },
        sitePhotos: {
          select: {
            id: true,
            photoUrl: true,
            caption: true,
          },
        },
      },
      orderBy: { reportDate: "desc" },
    }),
  ]);

  const morningMap = new Map<string, (typeof morningReports)[number]>();
  for (const row of morningReports) {
    const key = dateKeyOf(row.reportDate);
    if (!morningMap.has(key)) {
      morningMap.set(key, row);
    }
  }

  const eveningMap = new Map<string, (typeof eveningReports)[number]>();
  for (const row of eveningReports) {
    const key = dateKeyOf(row.reportDate);
    if (!eveningMap.has(key)) {
      eveningMap.set(key, row);
    }
  }

  const dateKeys = Array.from(new Set([...Array.from(morningMap.keys()), ...Array.from(eveningMap.keys())])).sort((a, b) =>
    b.localeCompare(a),
  );

  const workbook = new ExcelJS.Workbook();

  const summarySheet = workbook.addWorksheet("TongQuanNgay");
  summarySheet.columns = [
    { header: "Ngày", key: "date", width: 14 },
    { header: "Chỉ huy", key: "reporter", width: 28 },
    { header: "Báo cáo sáng", key: "morning", width: 24 },
    { header: "Báo cáo chiều", key: "evening", width: 24 },
    { header: "Đánh giá ngày", key: "rating", width: 20 },
    { header: "Phát sinh", key: "issues", width: 44 },
  ];
  summarySheet.getRow(1).font = { bold: true };

  const taskWorkSheet = workbook.addWorksheet("TaskDaLam");
  taskWorkSheet.columns = [
    { header: "Ngày", key: "date", width: 14 },
    { header: "Mã task", key: "code", width: 14 },
    { header: "Tên task", key: "name", width: 34 },
    { header: "Kế hoạch sáng", key: "planned", width: 40 },
    { header: "Thực tế", key: "actual", width: 40 },
    { header: "Tiến độ (%)", key: "completion", width: 14 },
    { header: "Đánh giá", key: "rating", width: 18 },
    { header: "Phát sinh", key: "issues", width: 34 },
    { header: "Số ảnh task", key: "taskPhotoCount", width: 14 },
  ];
  taskWorkSheet.getRow(1).font = { bold: true };

  const pausedSheet = workbook.addWorksheet("TaskTamDung");
  pausedSheet.columns = [
    { header: "Ngày", key: "date", width: 14 },
    { header: "Mã task", key: "code", width: 14 },
    { header: "Tên task", key: "name", width: 34 },
    { header: "Lý do", key: "reason", width: 24 },
    { header: "Ghi chú", key: "note", width: 40 },
    { header: "Chiều", key: "state", width: 18 },
  ];
  pausedSheet.getRow(1).font = { bold: true };

  const sitePhotoSheet = workbook.addWorksheet("AnhToanCanh");
  sitePhotoSheet.columns = [
    { header: "Ngày", key: "date", width: 14 },
    { header: "Ảnh ID", key: "photoId", width: 40 },
    { header: "URL", key: "url", width: 64 },
    { header: "Caption", key: "caption", width: 34 },
  ];
  sitePhotoSheet.getRow(1).font = { bold: true };

  for (const dateKey of dateKeys) {
    const morning = morningMap.get(dateKey) || null;
    const evening = eveningMap.get(dateKey) || null;
    const reporter = evening?.reporter.fullName || morning?.reporter.fullName || "-";

    summarySheet.addRow({
      date: formatDate(new Date(`${dateKey}T00:00:00Z`)),
      reporter,
      morning: formatSubmit(morning?.submittedAt || null, morning?.isOnTime ?? null),
      evening: formatSubmit(evening?.submittedAt || null, evening?.isOnTime ?? null),
      rating: ratingLabel(evening?.overallRating || null),
      issues: evening?.issues || "-",
    });

    const morningTaskById = new Map((morning?.taskReports || []).map((task) => [task.taskId, task]));
    const eveningTaskById = new Map((evening?.taskReports || []).map((task) => [task.taskId, task]));

    const workTaskIds = new Set<string>();
    (morning?.taskReports || []).forEach((task) => {
      if (task.decision === "WORK") workTaskIds.add(task.taskId);
    });
    (evening?.taskReports || []).forEach((task) => {
      if (
        task.completionPercent !== null ||
        task.actualWork ||
        task.actualWorkIfStarted ||
        task.rating ||
        task.issues ||
        task.taskPhotos.length > 0
      ) {
        workTaskIds.add(task.taskId);
      }
    });

    Array.from(workTaskIds)
      .map((taskId) => {
        const morningTask = morningTaskById.get(taskId);
        const eveningTask = eveningTaskById.get(taskId);
        return {
          code: eveningTask?.task.code || morningTask?.task.code || "-",
          name: eveningTask?.task.name || morningTask?.task.name || "-",
          planned: morningTask?.decision === "WORK" ? (morningTask.plannedActivity || "-") : "-",
          actual: eveningTask?.actualWork || eveningTask?.actualWorkIfStarted || "-",
          completion: eveningTask?.completionPercent ?? "-",
          rating: ratingLabel(eveningTask?.rating || null),
          issues: eveningTask?.issues || "-",
          taskPhotoCount: eveningTask?.taskPhotos.length || 0,
        };
      })
      .sort((a, b) => a.code.localeCompare(b.code))
      .forEach((row) => {
        taskWorkSheet.addRow({
          date: formatDate(new Date(`${dateKey}T00:00:00Z`)),
          ...row,
        });
      });

    (morning?.taskReports || [])
      .filter((task) => task.decision === "PAUSE")
      .forEach((task) => {
        const eveningTask = eveningTaskById.get(task.taskId);
        pausedSheet.addRow({
          date: formatDate(new Date(`${dateKey}T00:00:00Z`)),
          code: task.task.code,
          name: task.task.name,
          reason: task.pauseReason || "-",
          note: task.pauseNote || "-",
          state: pauseStateLabel(eveningTask?.stillPaused ?? null),
        });
      });

    (evening?.sitePhotos || []).forEach((photo) => {
      sitePhotoSheet.addRow({
        date: formatDate(new Date(`${dateKey}T00:00:00Z`)),
        photoId: photo.id,
        url: photo.photoUrl,
        caption: photo.caption || "-",
      });
    });
  }

  [summarySheet, taskWorkSheet, pausedSheet, sitePhotoSheet].forEach((sheet) => {
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) {
        row.alignment = { vertical: "top", wrapText: true };
      }
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const now = new Date();
  const filename = `NhatKyThiCong_${project.code}_${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(now.getUTCDate()).padStart(2, "0")}.xlsx`;

  return new NextResponse(Buffer.from(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
