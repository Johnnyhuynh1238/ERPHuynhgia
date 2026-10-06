import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/estimate";
import { injectPipelineEmbed } from "@/lib/pipeline-server";

export const dynamic = "force-dynamic";

// HTML hợp đồng soạn sẵn cho màn giai đoạn 3 trong ERP (chỉ admin, không có ở link khách).
// ?print=1 → trả thẳng trang HTML để mở tab mới và in A4.
export async function GET(
  request: Request,
  { params }: { params: { id: string } },
) {
  const { error } = await requireAdmin();
  if (error) return error;

  const row = await prisma.projectPipeline.findUnique({
    where: { id: params.id },
    select: { contractHtml: true },
  });
  if (!row)
    return NextResponse.json(
      { message: "Không tìm thấy dự án" },
      { status: 404 },
    );

  const html = row.contractHtml || "";
  if (new URL(request.url).searchParams.get("print") === "1") {
    // Chỉ chạy script in của ERP (nonce); script nằm trong file HĐ bị CSP chặn.
    const nonce = randomBytes(12).toString("base64");
    const printJs = `<script nonce="${nonce}">window.addEventListener("load",function(){setTimeout(function(){window.print()},300)})</script>`;
    const idx = html.toLowerCase().lastIndexOf("</body>");
    const page = !html
      ? "Chưa có hợp đồng"
      : idx >= 0
        ? html.slice(0, idx) + printJs + html.slice(idx)
        : html + printJs;
    return new NextResponse(page, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Content-Security-Policy": `script-src 'nonce-${nonce}'`,
      },
    });
  }
  return NextResponse.json(
    { html: html ? injectPipelineEmbed(html) : "" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
