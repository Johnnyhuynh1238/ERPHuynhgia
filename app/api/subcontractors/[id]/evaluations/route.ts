import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSubcontractorRead } from "@/lib/subcontractor-auth";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const { error } = await requireSubcontractorRead();
  if (error) return error;

  const subcontractor = await prisma.subcontractor.findUnique({
    where: { id: params.id },
    select: { id: true, code: true, name: true, avgRating: true },
  });

  if (!subcontractor) {
    return NextResponse.json({ message: "Không tìm thấy thầu phụ" }, { status: 404 });
  }

  const evaluations = await prisma.subEvaluation.findMany({
    where: {
      subContract: {
        subcontractorId: params.id,
      },
    },
    include: {
      subContract: {
        select: {
          id: true,
          code: true,
          title: true,
          project: { select: { id: true, code: true, name: true } },
        },
      },
      evaluator: { select: { id: true, fullName: true, role: true } },
      scores: {
        include: {
          criterion: { select: { id: true, code: true, name: true, weight: true } },
        },
        orderBy: { criterion: { sortOrder: "asc" } },
      },
    },
    orderBy: [{ createdAt: "desc" }],
  });

  const evaluationCount = evaluations.length;
  const hireAgainCount = evaluations.filter((x) => x.willHireAgain).length;

  return NextResponse.json({
    subcontractor: {
      ...subcontractor,
      avgRating: subcontractor.avgRating === null ? null : Number(subcontractor.avgRating),
    },
    stats: {
      evaluationCount,
      hireAgainCount,
      hireAgainRate: evaluationCount > 0 ? Math.round((hireAgainCount / evaluationCount) * 100) : 0,
    },
    evaluations: evaluations.map((row) => ({
      ...row,
      overallRating: Number(row.overallRating),
      scores: row.scores.map((score) => ({
        ...score,
        criterion: {
          ...score.criterion,
          weight: Number(score.criterion.weight),
        },
      })),
    })),
  });
}
