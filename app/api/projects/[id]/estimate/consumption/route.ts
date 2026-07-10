import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/estimate";
import { aggregateConsumption } from "@/app/projects/[id]/budget/totals/_lib/aggregate";

export const runtime = "nodejs";

// GET: hao phí VT/NC/MM toàn dự án.
// - Công tác qua định mức: Σ (KL × định mức × K); vật tư áp map NCC per dự án nếu có
//   (factor = số đơn vị định mức trong 1 đơn vị NCC, giữ số lẻ không làm tròn).
// - Line vật tư mua thẳng (materialPriceId, thép bóc chi tiết…): quantity × giá NCC, không qua định mức.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { error } = await requireAdmin();
  if (error) return error;

  const [lines, norms, materialPrices, laborPrices, machinePrices, maps] = await Promise.all([
    prisma.estimateLine.findMany({
      where: { item: { group: { projectId: params.id } } },
      select: {
        id: true,
        name: true,
        unit: true,
        quantity: true,
        normCode: true,
        materialPriceId: true,
        directUnitPrice: true,
        status: true,
        item: { select: { name: true, group: { select: { name: true } } } },
        materialPrice: { select: { name: true, unit: true, price: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.norm.findMany({
      where: { retiredAt: null },
      select: {
        code: true,
        name: true,
        unit: true,
        materialItems: true,
        laborItems: true,
        machineItems: true,
        kMaterial: true,
        kLabor: true,
        kMachine: true,
      },
    }),
    prisma.materialPrice.findMany({ where: { retiredAt: null }, select: { name: true, unit: true, price: true } }),
    prisma.laborPrice.findMany({ where: { retiredAt: null }, select: { grade: true, price: true } }),
    prisma.machinePrice.findMany({ where: { retiredAt: null }, select: { name: true, price: true } }),
    prisma.estimateMaterialMap.findMany({
      where: { projectId: params.id },
      select: {
        srcName: true,
        srcUnit: true,
        factor: true,
        materialPrice: { select: { id: true, name: true, unit: true, price: true, note: true } },
      },
    }),
  ]);

  // Chỉ line có mã định mức mới đi bóc tách. Line không mã + không NCC = trọn gói (lumpLines).
  const normLines = lines.filter((l) => l.normCode && !l.materialPriceId);
  const directLines = lines.filter((l) => l.materialPriceId && l.materialPrice);

  const result = aggregateConsumption({
    budgetItems: normLines.map((l) => ({
      id: l.id,
      name: l.name,
      stage: l.item.group.name,
      quantity: l.quantity,
      normCode: l.normCode,
      component: { name: l.item.name },
    })),
    normsByCode: new Map(norms.map((n) => [n.code, n])),
    priceMaterials: new Map(materialPrices.map((p) => [`${p.name}__${p.unit}`, Number(p.price)])),
    priceLabor: new Map(laborPrices.map((p) => [p.grade, Number(p.price)])),
    priceMachines: new Map(machinePrices.map((p) => [p.name, Number(p.price)])),
  });

  // Áp map NCC per dự án lên vật tư định mức
  const mapByKey = new Map(maps.map((m) => [`${m.srcName}__${m.srcUnit}`, m]));
  let deltaAmount = 0;
  let fixedMissing = 0;
  const materials = result.materials.map((m) => {
    const map = mapByKey.get(`${m.name}__${m.unit}`);
    if (!map) return { ...m, ncc: null };
    const factor = Number(map.factor) || 1;
    const nccQty = m.total / factor;
    const nccAmount = Math.round(nccQty * Number(map.materialPrice.price));
    if (m.amount != null) deltaAmount += nccAmount - m.amount;
    else {
      deltaAmount += nccAmount;
      fixedMissing++;
    }
    return {
      ...m,
      amount: nccAmount,
      ncc: {
        materialPriceId: map.materialPrice.id,
        name: map.materialPrice.name,
        unit: map.materialPrice.unit,
        price: Number(map.materialPrice.price),
        factor,
        qty: nccQty,
        note: map.materialPrice.note,
      },
    };
  });

  // Line vật tư mua thẳng NCC — cộng vào danh sách vật tư
  // Gộp vật tư mua thẳng theo hàng NCC (materialPriceId): nhiều công tác cùng 1 vật tư → 1 dòng tổng
  type DirectRow = {
    name: string; unit: string; total: number; price: number; amount: number;
    direct: true; lineName: string; lineIds: string[]; materialPriceId: string;
    contributions: Array<{ itemId: string; itemName: string; componentName: string; stage: string; quantity: number; qtyPerUnit: number; k: number; contrib: number }>;
  };
  const directMap = new Map<string, DirectRow>();
  for (const l of directLines) {
    const qty = Number(l.quantity);
    const price = Number(l.materialPrice!.price);
    const key = l.materialPriceId!;
    const contrib = { itemId: l.id, itemName: l.name, componentName: l.item.name, stage: l.item.group.name, quantity: qty, qtyPerUnit: 1, k: 1, contrib: qty };
    const ex = directMap.get(key);
    if (ex) {
      ex.total += qty;
      ex.amount += Math.round(qty * price);
      ex.lineIds.push(l.id);
      ex.contributions.push(contrib);
    } else {
      directMap.set(key, {
        name: l.materialPrice!.name, unit: l.materialPrice!.unit, total: qty, price,
        amount: Math.round(qty * price), direct: true, lineName: l.name,
        lineIds: [l.id], materialPriceId: key, contributions: [contrib],
      });
    }
  }
  const directMaterials = Array.from(directMap.values());
  const directAmount = directMaterials.reduce((s, d) => s + (d.amount ?? 0), 0);

  // Line trọn gói: công tác ngoài định mức (normCode null) chưa map NCC (materialPriceId null).
  // Nhập giá thẳng trên tab Hao phí (directUnitPrice). Mỗi line = 1 dòng riêng, không gộp.
  type LumpRow = {
    name: string; unit: string; total: number; price: number | null; amount: number | null;
    lump: true; lineName: string; lineIds: string[];
    contributions: Array<{ itemId: string; itemName: string; componentName: string; stage: string; quantity: number; qtyPerUnit: number; k: number; contrib: number }>;
  };
  const lumpLines = lines.filter((l) => !l.normCode && !l.materialPriceId);
  let lumpAmount = 0;
  let lumpMissing = 0;
  const lumpMaterials: LumpRow[] = lumpLines.map((l) => {
    const qty = Number(l.quantity);
    const price = l.directUnitPrice != null ? Number(l.directUnitPrice) : null;
    const amount = price != null ? Math.round(qty * price) : null;
    if (amount != null) lumpAmount += amount;
    else lumpMissing++;
    return {
      name: l.name, unit: l.unit, total: qty, price, amount,
      lump: true, lineName: l.name, lineIds: [l.id],
      contributions: [{ itemId: l.id, itemName: l.name, componentName: l.item.name, stage: l.item.group.name, quantity: qty, qtyPerUnit: 1, k: 1, contrib: qty }],
    };
  });

  const materialAmount = result.totals.materialAmount + deltaAmount + directAmount + lumpAmount;
  return NextResponse.json({
    ...result,
    materials: [...materials, ...directMaterials, ...lumpMaterials],
    totals: {
      ...result.totals,
      materialAmount,
      materialsMissingPrice: result.totals.materialsMissingPrice - fixedMissing + lumpMissing,
      grandTotal: materialAmount + result.totals.laborAmount + result.totals.machineAmount,
    },
    lineCount: lines.length,
    draftCount: lines.filter((l) => l.status === "ai_draft").length,
  });
}
