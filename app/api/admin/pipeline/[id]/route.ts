import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/estimate";

const MAX_HTML_BYTES = 3 * 1024 * 1024;

const PatchSchema = z.object({
  name: z.string().trim().min(1).optional(),
  customerName: z.string().trim().min(1).optional(),
  customerPhone: z.string().trim().nullable().optional(),
  address: z.string().trim().nullable().optional(),
  status: z.enum(["active", "paused", "done"]).optional(),
  stage: z.number().int().min(1).max(6).optional(),
  descriptionHtml: z.string().max(MAX_HTML_BYTES).nullable().optional(),
});

// Sửa thông tin / chuyển giai đoạn (admin tự bấm) / cập nhật trang mô tả HTML.
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
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
    return NextResponse.json({ message: "Dữ liệu không hợp lệ", issues: parsed.error.issues }, { status: 400 });
  }
  const d = parsed.data;

  const current = await prisma.projectPipeline.findUnique({
    where: { id: params.id },
    select: { stage: true, stageDates: true },
  });
  if (!current) return NextResponse.json({ message: "Không tìm thấy dự án" }, { status: 404 });

  const data: Prisma.ProjectPipelineUpdateInput = {};
  if (d.name !== undefined) data.name = d.name;
  if (d.customerName !== undefined) data.customerName = d.customerName;
  if (d.customerPhone !== undefined) data.customerPhone = d.customerPhone || null;
  if (d.address !== undefined) data.address = d.address || null;
  if (d.status !== undefined) data.status = d.status;

  if (d.descriptionHtml !== undefined) {
    data.descriptionHtml = d.descriptionHtml;
    data.descriptionUpdatedAt = d.descriptionHtml ? new Date() : null;
  }

  if (d.stage !== undefined && d.stage !== current.stage) {
    // Giai đoạn < stage mới = đã chốt (giữ ngày cũ, thiếu thì ghi lúc này); từ stage mới trở đi = bỏ ngày chốt.
    const old = (current.stageDates || {}) as Record<string, string>;
    const next: Record<string, string> = {};
    const nowIso = new Date().toISOString();
    for (let k = 1; k < d.stage; k++) next[String(k)] = old[String(k)] || nowIso;
    data.stage = d.stage;
    data.stageDates = next;
  }

  const updated = await prisma.projectPipeline.update({
    where: { id: params.id },
    data,
    select: { id: true, stage: true, status: true, stageDates: true, descriptionUpdatedAt: true },
  });
  return NextResponse.json(updated);
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const { error } = await requireAdmin();
  if (error) return error;

  const existed = await prisma.projectPipeline.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!existed) return NextResponse.json({ message: "Không tìm thấy dự án" }, { status: 404 });

  await prisma.projectPipeline.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
