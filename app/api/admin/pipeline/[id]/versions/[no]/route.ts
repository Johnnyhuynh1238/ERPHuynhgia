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
});

function parseNo(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : null;
}

// Cập nhật 1 phiên bản: ghi chú / file mô tả / file báo giá / tổng báo giá.
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
    select: { id: true },
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
  }
  if (d.quoteTotal !== undefined) data.quoteTotal = d.quoteTotal;

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
