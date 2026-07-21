import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// CÔNG KHAI (không auth) — dữ liệu dự toán cho trang tĩnh /du-toan-ngan.
// Chỉ đọc, chỉ trả số cần thiết. projectId trên URL đóng vai khoá chia sẻ.
// Bypass middleware qua nhánh /api/public/ (xem middleware.ts).
export async function GET(
  _req: Request,
  { params }: { params: { projectId: string } },
) {
  const project = await prisma.project.findUnique({
    where: { id: params.projectId },
    select: { id: true, code: true, name: true },
  });
  if (!project) return NextResponse.json({ error: "not found" }, { status: 404 });

  const rows = await prisma.estimateDbMaterial.findMany({
    where: { projectId: params.projectId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: {
      catalog: { select: { phaseCode: true, taskCode: true } },
      category: { select: { name: true } },
    },
  });

  const items = rows.map((r) => ({
    code: r.catalog ? `${r.catalog.phaseCode}-${r.catalog.taskCode}` : null,
    name: r.name,
    unit: r.unit,
    cat: r.category?.name ?? null,
    qty: Number(r.quantity),
    price: Number(r.unitPrice),
  }));

  const res = NextResponse.json({
    project: { code: project.code, name: project.name },
    items,
    updatedAt: new Date().toISOString(),
  });
  res.headers.set("Cache-Control", "no-store");
  return res;
}
