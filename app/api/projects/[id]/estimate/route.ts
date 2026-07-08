import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/estimate";

export const runtime = "nodejs";

// GET: toàn bộ cây nhóm → hạng mục của tab Mô tả
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { error } = await requireAdmin();
  if (error) return error;

  const groups = await prisma.estimateGroup.findMany({
    where: { projectId: params.id },
    orderBy: { sortOrder: "asc" },
    include: {
      items: {
        orderBy: { sortOrder: "asc" },
        include: { _count: { select: { lines: true } } },
      },
    },
  });

  return NextResponse.json({
    groups: groups.map((g) => ({
      id: g.id,
      name: g.name,
      sortOrder: g.sortOrder,
      items: g.items.map((it) => ({
        id: it.id,
        name: it.name,
        method: it.method,
        materialSpec: it.materialSpec,
        dimensions: it.dimensions,
        drawings: it.drawings,
        status: it.status,
        qaThread: it.qaThread,
        sortOrder: it.sortOrder,
        lineCount: it._count.lines,
      })),
    })),
  });
}
