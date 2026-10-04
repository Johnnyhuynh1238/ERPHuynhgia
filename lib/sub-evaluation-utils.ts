import { Prisma } from "@prisma/client";

export type EvaluationInputScore = {
  criterionId: string;
  score: number;
};

export function round2(value: number) {
  return Math.round(value * 100) / 100;
}

export function computeWeightedOverallRating(input: {
  activeCriteria: Array<{ id: string; weight: Prisma.Decimal | number }>;
  scores: EvaluationInputScore[];
}) {
  const scoreMap = new Map(input.scores.map((item) => [item.criterionId, Number(item.score)]));

  let weightedSum = 0;
  let weightTotal = 0;

  for (const criterion of input.activeCriteria) {
    const score = scoreMap.get(criterion.id);
    if (!score) continue;

    const weight = Number(criterion.weight || 0);
    if (!Number.isFinite(weight) || weight <= 0) continue;

    weightedSum += score * weight;
    weightTotal += weight;
  }

  if (weightTotal <= 0) return null;
  return round2(weightedSum / weightTotal);
}

export async function recomputeSubcontractorAggregates(tx: Prisma.TransactionClient, subcontractorId: string) {
  // Tuần tự: 1 transaction = 1 kết nối, không chạy song song query trên tx.
  const avgResult = await tx.subEvaluation.aggregate({
    where: {
      subContract: {
        subcontractorId,
      },
    },
    _avg: {
      overallRating: true,
    },
  });
  const totalContracts = await tx.subContract.count({
    where: { subcontractorId },
  });

  await tx.subcontractor.update({
    where: { id: subcontractorId },
    data: {
      avgRating: avgResult._avg.overallRating ?? null,
      totalContracts,
    },
  });
}
