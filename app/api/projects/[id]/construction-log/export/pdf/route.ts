import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { chromium } from "playwright";
import { getCurrentUser } from "@/lib/auth-helpers";
import { parseYmdToUtcDate, toUtcEndOfDay, toUtcStartOfDay } from "@/lib/date";
import { prisma } from "@/lib/prisma";
import { buildProjectAccessWhere } from "@/lib/project-permissions";

export const runtime = "nodejs";

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

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDate(date: Date) {
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = date.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function formatWeekday(date: Date) {
  return date.toLocaleDateString("vi-VN", { weekday: "long", timeZone: "UTC" });
}

function formatSubmitStatus(submittedAt: Date | null, isOnTime: boolean) {
  if (!submittedAt) return "-";
  const hh = String(submittedAt.getHours()).padStart(2, "0");
  const mm = String(submittedAt.getMinutes()).padStart(2, "0");
  return `${hh}:${mm} ${isOnTime ? "✓" : "(trễ)"}`;
}

function ratingLabel(value: "MET" | "UNDER" | "OVER" | null | undefined) {
  if (value === "MET") return "Đạt kế hoạch";
  if (value === "OVER") return "Vượt kế hoạch";
  if (value === "UNDER") return "Không đạt kế hoạch";
  return "-";
}

function dateKeyOf(value: Date) {
  return value.toISOString().slice(0, 10);
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
                thumbnailUrl: true,
                caption: true,
              },
              orderBy: { createdAt: "desc" },
            },
          },
        },
        sitePhotos: {
          select: { thumbnailUrl: true, photoUrl: true },
          orderBy: { uploadedAt: "desc" },
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

  const sections = dateKeys
    .map((dateKey) => {
      const morning = morningMap.get(dateKey) || null;
      const evening = eveningMap.get(dateKey) || null;
      const reporter = evening?.reporter || morning?.reporter || { fullName: "-" };

      const morningTaskById = new Map((morning?.taskReports || []).map((task) => [task.taskId, task]));
      const eveningTaskById = new Map((evening?.taskReports || []).map((task) => [task.taskId, task]));

      const taskIds = new Set<string>();
      (morning?.taskReports || []).forEach((task) => {
        if (task.decision === "WORK") taskIds.add(task.taskId);
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
          taskIds.add(task.taskId);
        }
      });

      const taskWorkLines = Array.from(taskIds)
        .map((taskId) => {
          const morningTask = morningTaskById.get(taskId);
          const eveningTask = eveningTaskById.get(taskId);
          const code = eveningTask?.task.code || morningTask?.task.code || "-";
          const name = eveningTask?.task.name || morningTask?.task.name || "-";
          const planned = morningTask?.decision === "WORK" ? (morningTask.plannedActivity || "-") : "-";
          const actual = eveningTask?.actualWork || eveningTask?.actualWorkIfStarted || "-";
          const rating = ratingLabel(eveningTask?.rating || null);
          const images = eveningTask?.taskPhotos || [];
          const issueText = eveningTask?.issues?.trim() ? ` · Phát sinh: ${escapeHtml(eveningTask.issues.trim())}` : "";
          const imageHtml = images.length
            ? `<div class="images">${images
                .map(
                  (photo) =>
                    `<a href="${escapeHtml(photo.photoUrl)}" target="_blank" rel="noreferrer"><img src="${escapeHtml(photo.thumbnailUrl)}" alt="task" style="width:96px;height:96px;object-fit:cover;border-radius:6px;border:1px solid #e2e8f0;" /></a>`,
                )
                .join("")}</div>`
            : "";

          return `<li>
              <strong>[${escapeHtml(code)}]</strong> ${escapeHtml(name)}<br/>
              - Kế hoạch sáng: ${escapeHtml(planned)}<br/>
              - Thực tế: ${escapeHtml(actual)}<br/>
              - Đánh giá: ${escapeHtml(rating)}${issueText}
              ${imageHtml}
            </li>`;
        })
        .join("");

      const pausedLines = (morning?.taskReports || [])
        .filter((task) => task.decision === "PAUSE")
        .map((task) => {
          const eveningTask = eveningTaskById.get(task.taskId);
          const pausedState = eveningTask?.stillPaused === true ? "Vẫn tạm dừng" : eveningTask?.stillPaused === false ? "Đã bắt đầu lại" : "-";
          return `<li><strong>[${escapeHtml(task.task.code)}]</strong> ${escapeHtml(task.task.name)} - Lý do: ${escapeHtml(task.pauseReason || "-")}<br/>- Ghi chú: ${escapeHtml(task.pauseNote || "-")}<br/>- Chiều: ${pausedState}</li>`;
        })
        .join("");

      const siteImages = (evening?.sitePhotos || [])
        .map(
          (photo) =>
            `<a href="${escapeHtml(photo.photoUrl)}" target="_blank" rel="noreferrer"><img src="${escapeHtml(photo.thumbnailUrl)}" alt="site" style="width:120px;height:120px;object-fit:cover;border-radius:6px;border:1px solid #e2e8f0;" /></a>`,
        )
        .join("");

      const dayDate = new Date(`${dateKey}T00:00:00Z`);

      return `
        <section class="entry">
          <div class="entry-head">
            <h3>${escapeHtml(formatWeekday(dayDate))}, ${formatDate(dayDate)}</h3>
            <div>Chỉ huy: ${escapeHtml(reporter.fullName || "-")}</div>
            <div>Báo cáo sáng: ${formatSubmitStatus(morning?.submittedAt || null, Boolean(morning?.isOnTime))} | Báo cáo chiều: ${formatSubmitStatus(evening?.submittedAt || null, Boolean(evening?.isOnTime))}</div>
            <div>Đánh giá ngày: ${escapeHtml(ratingLabel(evening?.overallRating || null))}</div>
          </div>

          <div class="entry-block">
            <h4>Task đã làm</h4>
            <ul>${taskWorkLines || "<li>-</li>"}</ul>
          </div>

          <div class="entry-block">
            <h4>Task tạm dừng</h4>
            <ul>${pausedLines || "<li>-</li>"}</ul>
          </div>

          <div class="entry-block">
            <h4>Ảnh toàn cảnh công trường</h4>
            <div class="images">${siteImages || "<span class='muted'>Không có ảnh toàn cảnh</span>"}</div>
          </div>

          <div class="entry-block">
            <h4>Phát sinh trong ngày</h4>
            <div class="note">${escapeHtml(evening?.issues || "-")}</div>
          </div>
        </section>
      `;
    })
    .join("");

  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Nhật ký thi công ${escapeHtml(project.code)}</title>
    <style>
      * { box-sizing: border-box; }
      body { font-family: Arial, sans-serif; color: #0f172a; margin: 0; padding: 0; }
      main { padding: 16px; }
      h1 { margin: 0; color: #1F4E79; font-size: 24px; }
      .sub { margin-top: 6px; margin-bottom: 12px; color: #475569; font-size: 13px; }
      .entry { border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; margin-bottom: 14px; page-break-inside: avoid; }
      .entry-head h3 { margin: 0 0 6px 0; color: #0f172a; font-size: 16px; text-transform: capitalize; }
      .entry-head div { font-size: 12px; color: #334155; margin-bottom: 2px; }
      .entry-block { margin-top: 10px; }
      .entry-block h4 { margin: 0 0 6px 0; font-size: 13px; color: #1f2937; }
      .entry-block ul { margin: 0; padding-left: 18px; }
      .entry-block li { font-size: 12px; line-height: 1.45; margin-bottom: 8px; }
      .images { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 6px; }
      .note { border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px; font-size: 12px; color: #334155; min-height: 28px; }
      .muted { color: #64748b; font-size: 12px; }
      .signature { margin-top: 20px; border-top: 1px dashed #94a3b8; padding-top: 14px; text-align: right; }
      .signature .line1 { font-size: 12px; color: #334155; }
      .signature .line2 { margin-top: 8px; font-size: 12px; color: #64748b; }
      .signature .line3 { margin-top: 44px; font-size: 12px; color: #64748b; }
      .generated { margin-top: 10px; font-size: 11px; color: #64748b; }
    </style>
  </head>
  <body>
    <main>
      <h1>Nhật ký thi công</h1>
      <div class="sub">${escapeHtml(project.code)} - ${escapeHtml(project.name)} · ${formatDate(from)} - ${formatDate(new Date(to))}</div>
      ${sections || "<p class='muted'>Không có dữ liệu trong khoảng thời gian đã chọn.</p>"}
      <div class="signature">
        <div class="line1">Kỹ sư phụ trách xác nhận</div>
        <div class="line2">Ngày ...... tháng ...... năm ......</div>
        <div class="line3">(Ký và ghi rõ họ tên)</div>
      </div>
      <div class="generated">Xuất lúc ${new Date().toLocaleString("vi-VN")}</div>
    </main>
  </body>
</html>`;

  const filename = `NhatKyThiCong_${project.code}_${new Date().toISOString().slice(0, 10)}.pdf`;

  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });

    const headerTitle = escapeHtml(`ERP Huỳnh Gia · ${project.code} - ${project.name}`);
    const footerRange = escapeHtml(`${formatDate(from)} - ${formatDate(new Date(to))}`);

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      displayHeaderFooter: true,
      margin: {
        top: "56px",
        right: "16px",
        bottom: "56px",
        left: "16px",
      },
      headerTemplate: `<div style="font-size:10px;color:#334155;width:100%;padding:0 16px;">${headerTitle}</div>`,
      footerTemplate: `<div style="font-size:10px;color:#64748b;width:100%;padding:0 16px;display:flex;justify-content:space-between;"><span>ERP Huỳnh Gia · Kỳ ${footerRange}</span><span>Trang <span class="pageNumber"></span>/<span class="totalPages"></span></span></div>`,
    });

    return new NextResponse(Buffer.from(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch {
    return NextResponse.json({ message: "Không thể tạo file PDF" }, { status: 500 });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
