import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/estimate";
import {
  fillPipelineQuoteDates,
  injectPipelineEmbed,
} from "@/lib/pipeline-server";

export const dynamic = "force-dynamic";

// HTML báo giá / giá vốn của 1 phiên bản cho màn giai đoạn 2 trong ERP (chỉ admin).
// Giá vốn không có đường công khai nào; báo giá chưa chốt cũng chỉ xem được qua đây.
export async function GET(
  request: Request,
  { params }: { params: { id: string; no: string } },
) {
  const { error } = await requireAdmin();
  if (error) return error;

  const versionNo = Number(params.no);
  const kind = new URL(request.url).searchParams.get("kind");
  if (
    !Number.isInteger(versionNo) ||
    versionNo < 1 ||
    (kind !== "quote" && kind !== "cost")
  )
    return NextResponse.json(
      { message: "Yêu cầu không hợp lệ" },
      { status: 400 },
    );

  const row = await prisma.projectPipelineVersion.findUnique({
    where: { pipelineId_versionNo: { pipelineId: params.id, versionNo } },
    select: {
      quoteHtml: kind === "quote",
      costHtml: kind === "cost",
      quotePublishedAt: true,
    },
  });
  if (!row)
    return NextResponse.json(
      { message: `Không tìm thấy phiên bản V${versionNo}` },
      { status: 404 },
    );

  let html = (kind === "quote" ? row.quoteHtml : row.costHtml) || "";
  if (kind === "quote")
    html = fillPipelineQuoteDates(html, row.quotePublishedAt);
  return NextResponse.json(
    { html: html ? injectPipelineEmbed(html) : "" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
