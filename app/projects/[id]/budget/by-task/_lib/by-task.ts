import type { Prisma } from "@prisma/client";

export type MaterialLine = {
  name: string;
  unit: string;
  qtyPerUnit: number;
  k: number;
  total: number;
  price: number | null;
  amount: number | null;
};
export type LaborLine = {
  grade: string;
  qtyPerUnit: number;
  k: number;
  total: number;
  price: number | null;
  amount: number | null;
};
export type MachineLine = {
  name: string;
  qtyPerUnit: number;
  k: number;
  total: number;
  price: number | null;
  amount: number | null;
};

export type TaskRow = {
  id: string;
  name: string;
  stage: string | null;
  componentName: string;
  componentSort: number;
  sortRank: number;
  quantity: number;
  normCode: string | null;
  normName: string | null;
  normUnit: string | null;
  hasNorm: boolean;
  hasNormData: boolean;
  materialLines: MaterialLine[];
  laborLines: LaborLine[];
  machineLines: MachineLine[];
  materialAmount: number;
  laborAmount: number;
  machineAmount: number;
  totalAmount: number;
  materialHasMissing: boolean;
  laborHasMissing: boolean;
  machineHasMissing: boolean;
};

export type ByTaskInput = {
  budgetItems: Array<{
    id: string;
    name: string;
    stage: string | null;
    sortRank: number;
    quantity: Prisma.Decimal | number;
    normCode: string | null;
    component: { name: string; sortOrder: number } | null;
  }>;
  normsByCode: Map<
    string,
    {
      code: string;
      name: string;
      unit: string;
      materialItems: unknown;
      laborItems: unknown;
      machineItems: unknown;
      kMaterial: Prisma.Decimal | number;
      kLabor: Prisma.Decimal | number;
      kMachine: Prisma.Decimal | number;
    }
  >;
  priceMaterials: Map<string, number>;
  priceLabor: Map<string, number>;
  priceMachines: Map<string, number>;
};

export type ByTaskResult = {
  rows: TaskRow[];
  totals: {
    materialAmount: number;
    laborAmount: number;
    machineAmount: number;
    grandTotal: number;
  };
};

function toNumber(v: Prisma.Decimal | number | undefined | null): number {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  return Number(v);
}

function parseMaterialItems(v: unknown): Array<{ name: string; unit: string; qtyPerUnit: number }> {
  if (!Array.isArray(v)) return [];
  return v
    .map((it) => {
      if (!it || typeof it !== "object") return null;
      const obj = it as Record<string, unknown>;
      const name = typeof obj.name === "string" ? obj.name.trim() : "";
      const unit = typeof obj.unit === "string" ? obj.unit.trim() : "";
      const qty = Number(obj.qtyPerUnit);
      if (!name || !unit || !Number.isFinite(qty) || qty <= 0) return null;
      return { name, unit, qtyPerUnit: qty };
    })
    .filter((x): x is { name: string; unit: string; qtyPerUnit: number } => x !== null);
}

function parseLaborItems(v: unknown): Array<{ grade: string; qtyPerUnit: number }> {
  if (!Array.isArray(v)) return [];
  return v
    .map((it) => {
      if (!it || typeof it !== "object") return null;
      const obj = it as Record<string, unknown>;
      const grade = typeof obj.grade === "string" ? obj.grade.trim() : "";
      const qty = Number(obj.qtyPerUnit);
      if (!grade || !Number.isFinite(qty) || qty <= 0) return null;
      return { grade, qtyPerUnit: qty };
    })
    .filter((x): x is { grade: string; qtyPerUnit: number } => x !== null);
}

function parseMachineItems(v: unknown): Array<{ name: string; qtyPerUnit: number }> {
  if (!Array.isArray(v)) return [];
  return v
    .map((it) => {
      if (!it || typeof it !== "object") return null;
      const obj = it as Record<string, unknown>;
      const name = typeof obj.name === "string" ? obj.name.trim() : "";
      const qty = Number(obj.qtyPerUnit);
      if (!name || !Number.isFinite(qty) || qty <= 0) return null;
      return { name, qtyPerUnit: qty };
    })
    .filter((x): x is { name: string; qtyPerUnit: number } => x !== null);
}

export function computeByTask(input: ByTaskInput): ByTaskResult {
  const rows: TaskRow[] = [];
  let totalM = 0;
  let totalL = 0;
  let totalK = 0;

  for (const item of input.budgetItems) {
    const qty = toNumber(item.quantity);
    const componentName = item.component?.name ?? "—";
    const componentSort = item.component?.sortOrder ?? 9999;
    const norm = item.normCode ? input.normsByCode.get(item.normCode) ?? null : null;

    const materialLines: MaterialLine[] = [];
    const laborLines: LaborLine[] = [];
    const machineLines: MachineLine[] = [];
    let materialAmount = 0;
    let laborAmount = 0;
    let machineAmount = 0;
    let materialHasMissing = false;
    let laborHasMissing = false;
    let machineHasMissing = false;
    let hasNormData = false;

    if (norm) {
      const mats = parseMaterialItems(norm.materialItems);
      const labs = parseLaborItems(norm.laborItems);
      const macs = parseMachineItems(norm.machineItems);
      hasNormData = mats.length > 0 || labs.length > 0 || macs.length > 0;
      const kMat = toNumber(norm.kMaterial) || 1;
      const kLab = toNumber(norm.kLabor) || 1;
      const kMac = toNumber(norm.kMachine) || 1;

      for (const m of mats) {
        const total = qty * m.qtyPerUnit * kMat;
        const price = input.priceMaterials.get(`${m.name}__${m.unit}`) ?? null;
        const amount = price != null ? Math.round(total * price) : null;
        if (amount != null) materialAmount += amount;
        else materialHasMissing = true;
        materialLines.push({ name: m.name, unit: m.unit, qtyPerUnit: m.qtyPerUnit, k: kMat, total, price, amount });
      }
      for (const l of labs) {
        const total = qty * l.qtyPerUnit * kLab;
        const price = input.priceLabor.get(l.grade) ?? null;
        const amount = price != null ? Math.round(total * price) : null;
        if (amount != null) laborAmount += amount;
        else laborHasMissing = true;
        laborLines.push({ grade: l.grade, qtyPerUnit: l.qtyPerUnit, k: kLab, total, price, amount });
      }
      for (const mm of macs) {
        const total = qty * mm.qtyPerUnit * kMac;
        const price = input.priceMachines.get(mm.name) ?? null;
        const amount = price != null ? Math.round(total * price) : null;
        if (amount != null) machineAmount += amount;
        else machineHasMissing = true;
        machineLines.push({ name: mm.name, qtyPerUnit: mm.qtyPerUnit, k: kMac, total, price, amount });
      }
    }

    const totalAmount = materialAmount + laborAmount + machineAmount;
    totalM += materialAmount;
    totalL += laborAmount;
    totalK += machineAmount;

    rows.push({
      id: item.id,
      name: item.name,
      stage: item.stage,
      componentName,
      componentSort,
      sortRank: item.sortRank,
      quantity: qty,
      normCode: item.normCode,
      normName: norm?.name ?? null,
      normUnit: norm?.unit ?? null,
      hasNorm: !!norm,
      hasNormData,
      materialLines,
      laborLines,
      machineLines,
      materialAmount,
      laborAmount,
      machineAmount,
      totalAmount,
      materialHasMissing,
      laborHasMissing,
      machineHasMissing,
    });
  }

  rows.sort((a, b) => {
    if (a.stage !== b.stage) return (a.stage ?? "").localeCompare(b.stage ?? "");
    if (a.componentSort !== b.componentSort) return a.componentSort - b.componentSort;
    return a.sortRank - b.sortRank;
  });

  return {
    rows,
    totals: {
      materialAmount: totalM,
      laborAmount: totalL,
      machineAmount: totalK,
      grandTotal: totalM + totalL + totalK,
    },
  };
}
