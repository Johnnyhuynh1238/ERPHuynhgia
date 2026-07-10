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

  // Nhập giá thẳng: tạo/cập nhật đơn giá trong catalog (name=srcName, unit=srcUnit) → tự áp cho
  // vật tư định mức trùng tên, đồng thời hiện luôn ở tab Đơn giá. Không cần qua tab Đơn giá tạo tay.
  if (body.newPrice !== undefined && body.newPrice !== null && body.newPrice !== "") {
    const price = Math.round(Number(body.newPrice));
    if (!Number.isFinite(price) || price < 0) {
      return NextResponse.json({ message: "Đơn giá không hợp lệ" }, { status: 400 });
    }
    const mp = await prisma.materialPrice.upsert({
      where: { name_unit: { name: srcName, unit: srcUnit } },
      create: { name: srcName, unit: srcUnit, price: BigInt(price), source: "Nhập nhanh (Hao phí)" },
      update: { price: BigInt(price), retiredAt: null },
    });
    // Gỡ map NCC cũ (nếu có) để dùng đúng giá vừa nhập theo tên định mức
    await prisma.estimateMaterialMap.deleteMany({ where: { projectId: params.id, srcName, srcUnit } });
    return NextResponse.json({ ok: true, materialPriceId: mp.id });
  }

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
