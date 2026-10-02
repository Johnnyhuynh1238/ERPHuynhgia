import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/estimate";
import { loadPipelineState } from "@/lib/pipeline-server";

const MAX_HTML_BYTES = 3 * 1024 * 1024;

const PatchSchema = z.object({
  note: z.string().trim().max(200).nullable().optional(),
  descriptionHtml: z.string().max(MAX_HTML_BYTES).nullable().optional(),
  quoteHtml: z.string().max(MAX_HTML_BYTES).nullable().optional(),
  quoteTotal: z
    .number()
    .int()
    .min(0)
    .max(999_999_999_999)
    .nullable()
    .optional(),
  quotePublished: z.boolean().optional(),
  costHtml: z.string().max(MAX_HTML_BYTES).nullable().optional(),
  costTotal: z.number().int().min(0).max(999_999_999_999).nullable().optional(),
});

function parseNo(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : null;
}

// Cập nhật 1 phiên bản: ghi chú / file mô tả / file báo giá / tổng báo giá / file + tổng giá vốn (nội bộ).
export async function PATCH(
  request: Request,
  { params }: { params: { id: string; no: string } },
) {
  const { error } = await requireAdmin();
  if (error) return error;

  const versionNo = parseNo(params.no);
  if (!versionNo)
    return NextResponse.json(
      { message: "Phiên bản không hợp lệ" },
      { status: 400 },
    );

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "JSON không hợp lệ" }, { status: 400 });
  }
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Dữ liệu không hợp lệ", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const d = parsed.data;

  const where = { pipelineId_versionNo: { pipelineId: params.id, versionNo } };
  const existed = await prisma.projectPipelineVersion.findUnique({
    where,
    select: { id: true, quoteHtml: true },
  });
  if (!existed)
    return NextResponse.json(
      { message: `Không tìm thấy phiên bản V${versionNo}` },
      { status: 404 },
    );

  const data: Prisma.ProjectPipelineVersionUpdateInput = {};
  if (d.note !== undefined) data.note = d.note || null;
  if (d.descriptionHtml !== undefined) {
    data.descriptionHtml = d.descriptionHtml;
    data.descriptionUpdatedAt = d.descriptionHtml ? new Date() : null;
  }
  if (d.quoteHtml !== undefined) {
    data.quoteHtml = d.quoteHtml;
    data.quoteUpdatedAt = d.quoteHtml ? new Date() : null;
    // Thay / gỡ file báo giá → ẩn lại với khách, admin xem xong chốt lại mới hiện.
    data.quotePublishedAt = null;
  }
  if (d.quotePublished !== undefined) {
    const hasQuote =
      d.quoteHtml !== undefined ? d.quoteHtml : existed.quoteHtml;
    if (d.quotePublished && !hasQuote)
      return NextResponse.json(
        { message: "Chưa có file báo giá để chốt" },
        { status: 400 },
      );
    data.quotePublishedAt = d.quotePublished ? new Date() : null;
  }
  if (d.quoteTotal !== undefined) data.quoteTotal = d.quoteTotal;
  // Giá vốn: nội bộ, chỉ đọc lại qua /api/admin/pipeline/[id]/versions/[no]/doc.
  if (d.costHtml !== undefined) {
    data.costHtml = d.costHtml;
    data.costUpdatedAt = d.costHtml ? new Date() : null;
  }
  if (d.costTotal !== undefined) data.costTotal = d.costTotal;

  await prisma.projectPipelineVersion.update({ where, data });
  return NextResponse.json(await loadPipelineState(params.id));
}

// Xoá phiên bản — chỉ bản mới nhất (giữ số liền mạch), không xoá bản duy nhất hay bản đang chốt hợp đồng.
export async function DELETE(
  _request: Request,
  { params }: { params: { id: string; no: string } },
) {
  const { error } = await requireAdmin();
  if (error) return error;

  const versionNo = parseNo(params.no);
  if (!versionNo)
    return NextResponse.json(
      { message: "Phiên bản không hợp lệ" },
      { status: 400 },
    );

  const current = await prisma.projectPipeline.findUnique({
    where: { id: params.id },
    select: {
      contractVersionNo: true,
      versions: { select: { versionNo: true } },
    },
  });
  if (!current)
    return NextResponse.json(
      { message: "Không tìm thấy dự án" },
      { status: 404 },
    );

  const nos = current.versions.map((v) => v.versionNo);
  if (nos.indexOf(versionNo) < 0) {
    return NextResponse.json(
      { message: `Không tìm thấy phiên bản V${versionNo}` },
      { status: 404 },
    );
  }
  if (nos.length <= 1)
    return NextResponse.json(
      { message: "Không xoá được phiên bản duy nhất" },
      { status: 409 },
    );
  if (versionNo !== Math.max.apply(null, nos)) {
    return NextResponse.json(
      { message: "Chỉ xoá được phiên bản mới nhất" },
      { status: 409 },
    );
  }
  if (current.contractVersionNo === versionNo) {
    return NextResponse.json(
      {
        message: `V${versionNo} đang được chọn chốt hợp đồng, chọn bản khác trước khi xoá`,
      },
      { status: 409 },
    );
  }

  await prisma.projectPipelineVersion.delete({
    where: { pipelineId_versionNo: { pipelineId: params.id, versionNo } },
  });
  return NextResponse.json(await loadPipelineState(params.id));
}
