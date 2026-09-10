import { NextResponse } from "next/server";
import { BudgetPlanGroup } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin, requireMuaHang } from "@/lib/estimate";

export const runtime = "nodejs";

// PHẦN dự án — nhóm hạng mục theo HĐTK (per-dự án, không cố định).
// GET: danh sách PHẦN + số VT + tổng tiền VT mỗi phần. POST: thêm 1 phần.

// GET: kế toán cần đọc để mua hàng theo phần; sửa vẫn admin.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { error } = await requireMuaHang();
  if (error) return error;

  const rows = await prisma.projectSection.findMany({
    where: { projectId: params.id },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: {
      materials: { select: { quantity: true, unitPrice: true } },
    },
  });

  const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
  const sections = rows.map((s) => {
    const total = s.materials.reduce((acc, m) => acc + Number(m.quantity) * Number(m.unitPrice), 0);
    return {
      id: s.id,
      name: s.name,
      kind: s.kind,
      sortOrder: s.sortOrder,
      planStart: iso(s.planStart),
      planEnd: iso(s.planEnd),
      matCount: s.materials.length,
      total,
    };
  });
  return NextResponse.json({ sections });
}

type Body = { name?: string; kind?: BudgetPlanGroup };

// POST: thêm 1 PHẦN
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { error } = await requireAdmin();
  if (error) return error;

  const b = (await req.json().catch(() => ({}))) as Body;
  const name = b.name?.trim();
  if (!name) return NextResponse.json({ message: "Thiếu tên phần" }, { status: 400 });
  const kind =
    b.kind && Object.values(BudgetPlanGroup).includes(b.kind) ? b.kind : BudgetPlanGroup.tho;

  const max = await prisma.projectSection.aggregate({
    where: { projectId: params.id },
    _max: { sortOrder: true },
  });

  const created = await prisma.projectSection.create({
    data: {
      projectId: params.id,
      name,
      kind,
      sortOrder: (max._max.sortOrder ?? 0) + 1,
    },
    select: { id: true, name: true, kind: true, sortOrder: true },
  });
  return NextResponse.json({ ...created, planStart: null, planEnd: null, matCount: 0, total: 0 });
}
