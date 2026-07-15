import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMuaHang } from "@/lib/estimate";

export const runtime = "nodejs";

// GET: dữ liệu tra cứu cho dropdown app Dự toán DB —
//   categories = danh mục chủng loại VT (lọc + gán)
//   tasks      = catalog chuẩn 92 công tác (mã GĐ-CT), chưa retire
export async function GET() {
  // Kế toán cần meta (chủng loại + công tác) để duyệt VT khi mua hàng.
  const { error } = await requireMuaHang();
  if (error) return error;

  const [categories, tasks] = await Promise.all([
    prisma.materialCategory.findMany({
      where: { retiredAt: null },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
    prisma.standardTaskCatalog.findMany({
      where: { retiredAt: null },
      orderBy: [{ phaseCode: "asc" }, { displayOrder: "asc" }],
      select: { id: true, phaseCode: true, taskCode: true, phaseName: true, taskName: true },
    }),
  ]);

  return NextResponse.json({
    categories,
    tasks: tasks.map((t) => ({
      id: t.id,
      code: `${t.phaseCode}-${t.taskCode}`,
      phaseCode: t.phaseCode,
      phaseName: t.phaseName,
      taskName: t.taskName,
    })),
  });
}
