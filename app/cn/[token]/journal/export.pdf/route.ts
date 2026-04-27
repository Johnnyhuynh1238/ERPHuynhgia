import { NextResponse } from "next/server";
import { chromium } from "playwright";
import { prisma } from "@/lib/prisma";
import { getCustomerPortalSessionByToken } from "@/lib/auth-helpers";

export const runtime = "nodejs";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export async function GET(request: Request, { params }: { params: { token: string } }) {
  const { project, session } = await getCustomerPortalSessionByToken(params.token);
  if (!project || !session) {
    return NextResponse.redirect(new URL(`/cn/${params.token}`, request.url));
  }

  const reports = await prisma.eveningReport.findMany({
    where: { projectId: project.id, submittedAt: { not: null } },
    include: {
      reporter: { select: { fullName: true } },
      taskReports: {
        include: {
          task: { select: { code: true, name: true, visibleToCustomer: true } },
          taskPhotos: { select: { thumbnailUrl: true }, take: 2 },
        },
      },
    },
    orderBy: { reportDate: "desc" },
    take: 45,
  });

  const blocks = reports
    .map((report) => {
      const taskRows = report.taskReports
        .filter((t) => t.task.visibleToCustomer)
        .map(
          (t) => `<li><b>[${escapeHtml(t.task.code)}]</b> ${escapeHtml(t.task.name)} - ${escapeHtml(t.actualWork || t.actualWorkIfStarted || "-")}</li>`,
        )
        .join("");

      return `<section class="entry">
        <h3>${new Date(report.reportDate).toLocaleDateString("vi-VN")} - ${escapeHtml(report.reporter.fullName)}</h3>
        <div>Đánh giá: ${escapeHtml(report.overallRating)}</div>
        <div>Ghi chú: ${escapeHtml(report.overallNote || report.issues || "-")}</div>
        <div><b>Công việc đã làm</b><ul>${taskRows || "<li>-</li>"}</ul></div>
      </section>`;
    })
    .join("");

  const html = `<!doctype html><html><head><meta charset="utf-8" /><style>
  body{font-family:Arial,sans-serif;color:#0f172a;padding:16px}
  h1{color:#1F4E79;margin:0 0 8px 0}
  .sub{font-size:12px;color:#475569;margin-bottom:14px}
  .entry{border:1px solid #e2e8f0;border-radius:8px;padding:10px;margin-bottom:10px;page-break-inside:avoid}
  .entry h3{margin:0 0 6px 0}
  ul{margin:6px 0 0 18px}
  li{font-size:12px;line-height:1.45}
  </style></head><body>
  <h1>Nhật ký thi công - Cổng chủ nhà</h1>
  <div class="sub">${escapeHtml(project.code)} - ${escapeHtml(project.name)}</div>
  ${blocks || "<div>Không có dữ liệu</div>"}
  </body></html>`;

  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
  try {
    browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    const pdfBuffer = await page.pdf({ format: "A4", printBackground: true });

    return new NextResponse(Buffer.from(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="NhatKy_${project.code}.pdf"`,
      },
    });
  } catch {
    return NextResponse.json({ message: "Không thể tạo file PDF" }, { status: 500 });
  } finally {
    if (browser) await browser.close();
  }
}
