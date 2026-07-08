import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/estimate";

export const runtime = "nodejs";

const DEFAULT_GROUPS = ["Phần thô", "Hoàn thiện", "ME (điện nước)"];

// POST: tạo nhóm mới; body {name} hoặc {defaults: true} tạo 3 nhóm mặc định
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { error } = await requireAdmin();
  if (error) return error;

  const project = await prisma.project.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!project) return NextResponse.json({ message: "Không tìm thấy dự án" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const max = await prisma.estimateGroup.aggregate({
    where: { projectId: params.id },
    _max: { sortOrder: true },
  });
  let next = (max._max.sortOrder ?? -1) + 1;

  if (body.defaults === true) {
    await prisma.estimateGroup.createMany({
      data: DEFAULT_GROUPS.map((name) => ({ projectId: params.id, name, sortOrder: next++ })),
    });
    return NextResponse.json({ ok: true });
  }

  const name = String(body.name || "").trim();
  if (!name) return NextResponse.json({ message: "Thiếu tên nhóm" }, { status: 400 });
  const group = await prisma.estimateGroup.create({
    data: { projectId: params.id, name, sortOrder: next },
  });
  return NextResponse.json({ id: group.id });
}
