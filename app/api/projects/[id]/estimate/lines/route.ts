import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/estimate";

export const runtime = "nodejs";

// GET: cây nhóm → hạng mục → line khối lượng cho tab Khối lượng
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { error } = await requireAdmin();
  if (error) return error;

  const groups = await prisma.estimateGroup.findMany({
    where: { projectId: params.id },
    orderBy: { sortOrder: "asc" },
    include: {
      items: {
        orderBy: { sortOrder: "asc" },
        include: {
          lines: {
            orderBy: { sortOrder: "asc" },
            include: { norm: { select: { name: true, unit: true } } },
          },
        },
      },
    },
  });

  return NextResponse.json({
    groups: groups.map((g) => ({
      id: g.id,
      name: g.name,
      items: g.items.map((it) => ({
        id: it.id,
        name: it.name,
        status: it.status,
        qaThread: it.qaThread,
        lines: it.lines.map((l) => ({
          id: l.id,
          normCode: l.normCode,
          normName: l.norm?.name ?? null,
          name: l.name,
          unit: l.unit,
          formula: l.formula,
          quantity: Number(l.quantity),
          status: l.status,
          aiQuestion: l.aiQuestion,
          note: l.note,
        })),
      })),
    })),
  });
}
