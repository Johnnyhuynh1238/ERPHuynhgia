import { Prisma } from "@prisma/client";
import { DEFAULT_KPI_SETTINGS_WEIGHTS } from "@/lib/kpi";
import type { ActiveKpiSettings, KpiComponentScores } from "@/lib/kpi";

export const BASE_SALARY_RATIO = 0.5;
export const BONUS_MAX_RATIO = 0.5;

type KpiWeightInput = Pick<ActiveKpiSettings, "weightTienDo" | "weightQc" | "weightBaoCao" | "weightChuNha" | "weightDongGop">;

const BONUS_TIERS = [
  { min: 90, ratio: 1, label: "Xuất sắc" },
  { min: 75, ratio: 0.75, label: "Tốt" },
  { min: 60, ratio: 0.5, label: "Đạt" },
  { min: 40, ratio: 0.25, label: "Yếu" },
  { min: 0, ratio: 0, label: "Kém" },
] as const;

export type BonusTier = (typeof BONUS_TIERS)[number];

export type SalaryCalcResult = {
  salaryMax: number;
  baseSalary: number;
  bonusMax: number;
  bonusRatio: number;
  bonusLabel: string;
  bonusAmount: number;
  totalSalary: number;
};

function round2(value: number) {
  return Number(value.toFixed(2));
}

export function toNumber(value: Prisma.Decimal | number | string | null | undefined) {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return value.toNumber();
}

export function calculateBonusTier(totalScore: number): BonusTier {
  const normalizedScore = Number.isFinite(totalScore) ? totalScore : 0;
  return BONUS_TIERS.find((tier) => normalizedScore >= tier.min) ?? BONUS_TIERS[BONUS_TIERS.length - 1];
}

export function calculateBonusRatio(totalScore: number) {
  return calculateBonusTier(totalScore).ratio;
}

export function calculateTotalScore(input: KpiComponentScores, settings: KpiWeightInput = DEFAULT_KPI_SETTINGS_WEIGHTS) {
  const total =
    input.schedule * (settings.weightTienDo / 100) +
    input.qc * (settings.weightQc / 100) +
    input.report * (settings.weightBaoCao / 100) +
    input.customer * (settings.weightChuNha / 100) +
    input.contribution * (settings.weightDongGop / 100);

  return round2(total);
}

export function calculateSalary(salaryMax: number, totalScore: number): SalaryCalcResult {
  const safeSalaryMax = Math.max(0, Number.isFinite(salaryMax) ? salaryMax : 0);
  const safeScore = Math.max(0, Math.min(100, Number.isFinite(totalScore) ? totalScore : 0));

  const baseSalary = round2(safeSalaryMax * BASE_SALARY_RATIO);
  const bonusMax = round2(safeSalaryMax * BONUS_MAX_RATIO);
  const tier = calculateBonusTier(safeScore);
  const bonusAmount = round2(bonusMax * tier.ratio);
  const totalSalary = round2(baseSalary + bonusAmount);

  return {
    salaryMax: round2(safeSalaryMax),
    baseSalary,
    bonusMax,
    bonusRatio: tier.ratio,
    bonusLabel: tier.label,
    bonusAmount,
    totalSalary,
  };
}

export function asPrismaDecimal(value: number) {
  return new Prisma.Decimal(round2(value));
}
