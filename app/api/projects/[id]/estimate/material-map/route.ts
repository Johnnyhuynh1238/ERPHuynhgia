import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/estimate";

export const runtime = "nodejs";

// POST: chọn hàng NCC cho 1 vật tư định mức (upsert per dự án).
// body {srcName, srcUnit, materialPriceId, factor} — materialPriceId null = bỏ map.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { error } = await requireAdmin();
  if (error) return error;

  const body = await req.json().catch(() => ({}));
  const srcName = String(body.srcName || "").trim();
  const srcUnit = String(body.srcUnit || "").trim();
  if (!srcName || !srcUnit) return NextResponse.json({ message: "Thiếu vật tư nguồn" }, { status: 400 });

  if (!body.materialPriceId) {
    await prisma.estimateMaterialMap.deleteMany({
      where: { projectId: params.id, srcName, srcUnit },
    });
    return NextResponse.json({ ok: true });
  }

  const mp = await prisma.materialPrice.findUnique({ where: { id: String(body.materialPriceId) }, select: { id: true } });
  if (!mp) return NextResponse.json({ message: "Không tìm thấy hàng NCC" }, { status: 404 });

  const factor = Number(body.factor);
  if (!Number.isFinite(factor) || factor <= 0) {
    return NextResponse.json({ message: "Hệ số quy đổi không hợp lệ" }, { status: 400 });
  }

  await prisma.estimateMaterialMap.upsert({
    where: { projectId_srcName_srcUnit: { projectId: params.id, srcName, srcUnit } },
    create: { projectId: params.id, srcName, srcUnit, materialPriceId: mp.id, factor },
    update: { materialPriceId: mp.id, factor },
  });
  return NextResponse.json({ ok: true });
}

// GET: danh sách hàng NCC cho dropdown chọn
export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;
  const prices = await prisma.materialPrice.findMany({
    where: { retiredAt: null },
    select: { id: true, name: true, unit: true, price: true, source: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({
    prices: prices.map((p) => ({ ...p, price: Number(p.price) })),
  });
}
