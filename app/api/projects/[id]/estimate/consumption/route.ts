import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/estimate";
import { aggregateConsumption } from "@/app/projects/[id]/budget/totals/_lib/aggregate";
import { STEEL_DEFAULT_BAR_LEN, steelTonnage, steelUnit, steelWaste } from "@/lib/steel";

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
        steelDia: true,
        steelBarLen: true,
        steelPriceId: true,
        item: { select: { name: true, group: { select: { name: true } } } },
        materialPrice: { select: { name: true, unit: true, price: true } },
        steelPrice: { select: { id: true, name: true, unit: true, price: true } },
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

  // Line cốt thép (steelDia != null): đi qua định mức để tính NC + máy + phụ, nhưng quy về TẤN.
  const steelLines = lines.filter((l) => l.steelDia != null && l.normCode);
  // Chỉ line có mã định mức (không thép) mới đi bóc tách thường. Không mã + không NCC = trọn gói.
  const normLines = lines.filter((l) => l.normCode && !l.materialPriceId && l.steelDia == null);
  const directLines = lines.filter((l) => l.materialPriceId && l.materialPrice && l.steelDia == null);

  const result = aggregateConsumption({
    budgetItems: [
      ...normLines.map((l) => ({
        id: l.id,
        name: l.name,
        stage: l.item.group.name,
        quantity: l.quantity,
        normCode: l.normCode,
        component: { name: l.item.name },
      })),
      // Thép: quantity = tấn quy đổi (cây × dài × kg/m ÷ 1000) → định mức tính NC + máy + phụ theo tấn.
      ...steelLines.map((l) => ({
        id: l.id,
        name: l.name,
        stage: l.item.group.name,
        quantity: steelTonnage(l.steelDia!, Number(l.quantity), Number(l.steelBarLen) || STEEL_DEFAULT_BAR_LEN),
        normCode: l.normCode,
        component: { name: l.item.name },
      })),
    ],
    normsByCode: new Map(norms.map((n) => [n.code, n])),
    priceMaterials: new Map(materialPrices.map((p) => [`${p.name}__${p.unit}`, Number(p.price)])),
    priceLabor: new Map(laborPrices.map((p) => [p.grade, Number(p.price)])),
    priceMachines: new Map(machinePrices.map((p) => [p.name, Number(p.price)])),
  });

  // Thép chính (tên "Thép tròn …") đến từ định mức thép — bỏ ra khỏi bảng VT định mức,
  // xuất riêng theo cây/kg từng Ø ở dưới (dây buộc / que hàn vẫn giữ trong định mức).
  let steelNormThepAmount = 0;
  let steelNormThepMissing = 0;
  const nonSteelThep = result.materials.filter((m) => {
    if (m.name.startsWith("Thép tròn")) {
      if (m.amount != null) steelNormThepAmount += m.amount;
      else steelNormThepMissing++;
      return false;
    }
    return true;
  });

  // Áp map NCC per dự án lên vật tư định mức
  const mapByKey = new Map(maps.map((m) => [`${m.srcName}__${m.srcUnit}`, m]));
  let deltaAmount = 0;
  let fixedMissing = 0;
  const materials = nonSteelThep.map((m) => {
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

  // Thép chính mua riêng theo cây/kg từng Ø: số lượng mua = số bóc × hao hụt, giá theo hàng NCC thép.
  // Gộp theo Ø + hàng NCC (nhiều công tác cùng Ø, cùng NCC → 1 dòng để đi mua).
  // Dùng cờ direct để tái dùng hiển thị/đổi NCC ở tab Hao phí; steel để tab patch đúng steelPriceId.
  type SteelRow = {
    name: string; unit: string; total: number; price: number | null; amount: number | null;
    direct: true; steel: true; dia: number; lineName: string; lineIds: string[]; materialPriceId?: string;
    contributions: Array<{ itemId: string; itemName: string; componentName: string; stage: string; quantity: number; qtyPerUnit: number; k: number; contrib: number }>;
  };
  const steelMap = new Map<string, SteelRow>();
  let steelAmount = 0;
  let steelMissing = 0;
  for (const l of steelLines) {
    const dia = l.steelDia!;
    const waste = steelWaste(dia);
    const boc = Number(l.quantity);
    const buyQty = boc * waste;
    const sp = l.steelPrice;
    const price = sp ? Number(sp.price) : null;
    const name = sp?.name ?? `Thép Ø${dia}`;
    const unit = sp?.unit ?? steelUnit(dia);
    const key = `${dia}__${l.steelPriceId ?? "none"}`;
    const contrib = { itemId: l.id, itemName: l.name, componentName: l.item.name, stage: l.item.group.name, quantity: boc, qtyPerUnit: waste, k: 1, contrib: buyQty };
    const ex = steelMap.get(key);
    if (ex) {
      ex.total += buyQty;
      if (ex.amount != null && price != null) ex.amount += Math.round(buyQty * price);
      ex.lineIds.push(l.id);
      ex.contributions.push(contrib);
    } else {
      steelMap.set(key, {
        name, unit, total: buyQty, price,
        amount: price != null ? Math.round(buyQty * price) : null,
        direct: true, steel: true, dia, lineName: l.name, lineIds: [l.id],
        materialPriceId: l.steelPriceId ?? undefined, contributions: [contrib],
      });
    }
  }
  const steelMaterials = Array.from(steelMap.values());
  for (const s of steelMaterials) {
    if (s.amount != null) steelAmount += s.amount;
    else steelMissing++;
  }

  const materialAmount =
    result.totals.materialAmount - steelNormThepAmount + deltaAmount + directAmount + lumpAmount + steelAmount;
  return NextResponse.json({
    ...result,
    materials: [...materials, ...directMaterials, ...lumpMaterials, ...steelMaterials],
    totals: {
      ...result.totals,
      materialAmount,
      materialsMissingPrice:
        result.totals.materialsMissingPrice - fixedMissing - steelNormThepMissing + lumpMissing + steelMissing,
      grandTotal: materialAmount + result.totals.laborAmount + result.totals.machineAmount,
    },
    lineCount: lines.length,
    draftCount: lines.filter((l) => l.status === "ai_draft").length,
  });
}
