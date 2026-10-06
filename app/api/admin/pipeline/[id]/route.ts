import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/estimate";
import { loadPipelineState } from "@/lib/pipeline-server";

const PatchSchema = z.object({
  name: z.string().trim().min(1).optional(),
  customerName: z.string().trim().min(1).optional(),
  customerPhone: z.string().trim().nullable().optional(),
  address: z.string().trim().nullable().optional(),
  status: z.enum(["active", "paused", "done"]).optional(),
  stage: z.number().int().min(1).max(6).optional(),
  contractVersionNo: z.number().int().min(1).optional(),
  contractHtml: z.string().max(3 * 1024 * 1024).nullable().optional(),
});

// Sửa thông tin / chuyển giai đoạn (admin tự bấm) / chọn báo giá chốt hợp đồng.
// Mô tả + báo giá theo phiên bản: xem ./versions.
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  const { error } = await requireAdmin();
  if (error) return error;

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

  const current = await prisma.projectPipeline.findUnique({
    where: { id: params.id },
    select: {
      stage: true,
      stageDates: true,
      contractVersionNo: true,
      versions: { select: { versionNo: true } },
    },
  });
  if (!current)
    return NextResponse.json(
      { message: "Không tìm thấy dự án" },
      { status: 404 },
    );

  const versionNos = current.versions.map((v) => v.versionNo);

  const data: Prisma.ProjectPipelineUpdateInput = {};
  if (d.name !== undefined) data.name = d.name;
  if (d.customerName !== undefined) data.customerName = d.customerName;
  if (d.customerPhone !== undefined)
    data.customerPhone = d.customerPhone || null;
  if (d.address !== undefined) data.address = d.address || null;
  if (d.status !== undefined) data.status = d.status;
  if (d.contractHtml !== undefined) {
    data.contractHtml = d.contractHtml || null;
    data.contractUpdatedAt = d.contractHtml ? new Date() : null;
  }

  let contractNo = current.contractVersionNo;
  if (d.contractVersionNo !== undefined) {
    if (versionNos.indexOf(d.contractVersionNo) < 0) {
      return NextResponse.json(
        { message: `Không có phiên bản V${d.contractVersionNo}` },
        { status: 400 },
      );
    }
    contractNo = d.contractVersionNo;
    data.contractVersionNo = contractNo;
  }

  if (d.stage !== undefined && d.stage !== current.stage) {
    // Giai đoạn < stage mới = đã chốt (giữ ngày cũ, thiếu thì ghi lúc này); từ stage mới trở đi = bỏ ngày chốt.
    // Lùi giai đoạn KHÔNG xoá mô tả / báo giá của các phiên bản.
    const old = (current.stageDates || {}) as Record<string, string>;
    const next: Record<string, string> = {};
    const nowIso = new Date().toISOString();
    for (let k = 1; k < d.stage; k++)
      next[String(k)] = old[String(k)] || nowIso;
    data.stage = d.stage;
    data.stageDates = next;
    // Vào giai đoạn Hợp đồng mà chưa chọn báo giá → mặc định bản mới nhất (admin đổi được ở màn Hợp đồng).
    if (d.stage >= 3 && contractNo === null && versionNos.length > 0) {
      data.contractVersionNo = Math.max.apply(null, versionNos);
    }
  }

  await prisma.projectPipeline.update({ where: { id: params.id }, data });
  return NextResponse.json(await loadPipelineState(params.id));
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const { error } = await requireAdmin();
  if (error) return error;

  const existed = await prisma.projectPipeline.findUnique({
    where: { id: params.id },
    select: { id: true },
  });
  if (!existed)
    return NextResponse.json(
      { message: "Không tìm thấy dự án" },
      { status: 404 },
    );

  await prisma.projectPipeline.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
