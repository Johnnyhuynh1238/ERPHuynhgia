import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/estimate";

export const runtime = "nodejs";

// GET: nhật ký kế toán bị chặn (thiếu giá / vượt SL). Chỉ admin xem.
// Gộp theo VT + loại lỗi để admin biết ngay VT nào cần xử.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { error } = await requireAdmin();
  if (error) return error;

  const rows = await prisma.mhOrderBlock.findMany({
    where: { projectId: params.id },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const userIds = [...new Set(rows.map((r) => r.userId))];
  const users = userIds.length
    ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true } })
    : [];
  const nameOf: Record<string, string> = {};
  users.forEach((u) => (nameOf[u.id] = u.fullName || ""));

  // Gộp: 1 dòng / (VT + loại), giữ lần chặn gần nhất + số lần.
  type Agg = {
    key: string;
    kind: string;
    materialName: string;
    unit: string;
    need: number;
    have: number;
    budget: number;
    count: number;
    lastAt: string;
    lastBy: string;
  };
  const map: Record<string, Agg> = {};
  for (const r of rows) {
    const key = `${r.kind}|${r.materialName}|${r.unit}`;
    if (!map[key]) {
      map[key] = {
        key,
        kind: r.kind,
        materialName: r.materialName,
        unit: r.unit,
        need: Number(r.need),
        have: Number(r.have),
        budget: Number(r.budget),
        count: 0,
        lastAt: r.createdAt.toISOString(),
        lastBy: nameOf[r.userId] || "Kế toán",
      };
    }
    map[key].count += 1;
  }

  return NextResponse.json({
    items: Object.values(map).sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1)),
  });
}
