import type { Prisma } from "@prisma/client";

export type MaterialItem = { name: string; unit: string; qtyPerUnit: number };
export type LaborItem = { grade: string; qtyPerUnit: number };
export type MachineItem = { name: string; qtyPerUnit: number };

export type ContribRow = {
  itemId: string;
  itemName: string;
  componentName: string;
  stage: string;
  quantity: number;
  qtyPerUnit: number;
  k: number;
  contrib: number;
};

export type AggregatedMaterial = {
  name: string;
  unit: string;
  total: number;
  price: number | null;
  amount: number | null;
  contributions: ContribRow[];
};
export type AggregatedLabor = {
  grade: string;
  total: number;
  price: number | null;
  amount: number | null;
  contributions: ContribRow[];
};
export type AggregatedMachine = {
  name: string;
  total: number;
  price: number | null;
  amount: number | null;
  contributions: ContribRow[];
};

export type AggregateInput = {
  budgetItems: Array<{
    id: string;
    name: string;
    stage: string | null;
    quantity: Prisma.Decimal | number;
    normCode: string | null;
    component: { name: string } | null;
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
  priceMaterials?: Map<string, number>; // key: name__unit
  priceLabor?: Map<string, number>; // key: grade
  priceMachines?: Map<string, number>; // key: name
};

function toNumber(v: Prisma.Decimal | number | undefined | null): number {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  return Number(v);
}

function parseMaterialItems(v: unknown): MaterialItem[] {
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
    .filter((x): x is MaterialItem => x !== null);
}

function parseLaborItems(v: unknown): LaborItem[] {
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
    .filter((x): x is LaborItem => x !== null);
}

function parseMachineItems(v: unknown): MachineItem[] {
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
    .filter((x): x is MachineItem => x !== null);
}

export type AggregateResult = {
  materials: AggregatedMaterial[];
  labor: AggregatedLabor[];
  machines: AggregatedMachine[];
  itemsWithoutNorm: Array<{ id: string; stage: string | null; name: string; componentName: string }>;
  itemsWithNormNoData: Array<{
    id: string;
    stage: string | null;
    name: string;
    componentName: string;
    normCode: string;
  }>;
  totals: {
    materialAmount: number;
    laborAmount: number;
    machineAmount: number;
    grandTotal: number;
    materialsMissingPrice: number;
    laborMissingPrice: number;
    machinesMissingPrice: number;
  };
};

export function aggregateConsumption(input: AggregateInput): AggregateResult {
  const materials = new Map<string, AggregatedMaterial>();
  const labor = new Map<string, AggregatedLabor>();
  const machines = new Map<string, AggregatedMachine>();
  const itemsWithoutNorm: AggregateResult["itemsWithoutNorm"] = [];
  const itemsWithNormNoData: AggregateResult["itemsWithNormNoData"] = [];

  for (const item of input.budgetItems) {
    const qty = toNumber(item.quantity);
    const componentName = item.component?.name ?? "—";

    if (!item.normCode) {
      itemsWithoutNorm.push({
        id: item.id,
        stage: item.stage,
        name: item.name,
        componentName,
      });
      continue;
    }

    const norm = input.normsByCode.get(item.normCode);
    if (!norm) continue;

    const materialItems = parseMaterialItems(norm.materialItems);
    const laborItems = parseLaborItems(norm.laborItems);
    const machineItems = parseMachineItems(norm.machineItems);

    if (materialItems.length === 0 && laborItems.length === 0 && machineItems.length === 0) {
      itemsWithNormNoData.push({
        id: item.id,
        stage: item.stage,
        name: item.name,
        componentName,
        normCode: item.normCode,
      });
      continue;
    }

    const kMat = toNumber(norm.kMaterial) || 1;
    const kLab = toNumber(norm.kLabor) || 1;
    const kMac = toNumber(norm.kMachine) || 1;

    for (const m of materialItems) {
      const key = `${m.name}__${m.unit}`;
      const contrib = qty * m.qtyPerUnit * kMat;
      const existing = materials.get(key);
      const row: ContribRow = {
        itemId: item.id,
        itemName: item.name,
        componentName,
        stage: item.stage ?? "—",
        quantity: qty,
        qtyPerUnit: m.qtyPerUnit,
        k: kMat,
        contrib,
      };
      if (existing) {
        existing.total += contrib;
        existing.contributions.push(row);
      } else {
        materials.set(key, {
          name: m.name,
          unit: m.unit,
          total: contrib,
          price: null,
          amount: null,
          contributions: [row],
        });
      }
    }

    for (const l of laborItems) {
      const contrib = qty * l.qtyPerUnit * kLab;
      const existing = labor.get(l.grade);
      const row: ContribRow = {
        itemId: item.id,
        itemName: item.name,
        componentName,
        stage: item.stage ?? "—",
        quantity: qty,
        qtyPerUnit: l.qtyPerUnit,
        k: kLab,
        contrib,
      };
      if (existing) {
        existing.total += contrib;
        existing.contributions.push(row);
      } else {
        labor.set(l.grade, {
          grade: l.grade,
          total: contrib,
          price: null,
          amount: null,
          contributions: [row],
        });
      }
    }

    for (const mm of machineItems) {
      const contrib = qty * mm.qtyPerUnit * kMac;
      const existing = machines.get(mm.name);
      const row: ContribRow = {
        itemId: item.id,
        itemName: item.name,
        componentName,
        stage: item.stage ?? "—",
        quantity: qty,
        qtyPerUnit: mm.qtyPerUnit,
        k: kMac,
        contrib,
      };
      if (existing) {
        existing.total += contrib;
        existing.contributions.push(row);
      } else {
        machines.set(mm.name, {
          name: mm.name,
          total: contrib,
          price: null,
          amount: null,
          contributions: [row],
        });
      }
    }
  }

  let materialAmount = 0;
  let laborAmount = 0;
  let machineAmount = 0;
  let materialsMissingPrice = 0;
  let laborMissingPrice = 0;
  let machinesMissingPrice = 0;

  materials.forEach((row, key) => {
    const price = input.priceMaterials?.get(key);
    if (price != null) {
      row.price = price;
      row.amount = Math.round(row.total * price);
      materialAmount += row.amount;
    } else {
      materialsMissingPrice++;
    }
  });
  labor.forEach((row, key) => {
    const price = input.priceLabor?.get(key);
    if (price != null) {
      row.price = price;
      row.amount = Math.round(row.total * price);
      laborAmount += row.amount;
    } else {
      laborMissingPrice++;
    }
  });
  machines.forEach((row, key) => {
    const price = input.priceMachines?.get(key);
    if (price != null) {
      row.price = price;
      row.amount = Math.round(row.total * price);
      machineAmount += row.amount;
    } else {
      machinesMissingPrice++;
    }
  });

  const sortedMaterials = Array.from(materials.values()).sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0));
  const sortedLabor = Array.from(labor.values()).sort((a, b) => a.grade.localeCompare(b.grade));
  const sortedMachines = Array.from(machines.values()).sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0));

  return {
    materials: sortedMaterials,
    labor: sortedLabor,
    machines: sortedMachines,
    itemsWithoutNorm,
    itemsWithNormNoData,
    totals: {
      materialAmount,
      laborAmount,
      machineAmount,
      grandTotal: materialAmount + laborAmount + machineAmount,
      materialsMissingPrice,
      laborMissingPrice,
      machinesMissingPrice,
    },
  };
}
