import { Prisma, UserRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { canUserAccessSubContract, requireSubContractReadUser } from "@/lib/sub-contract-auth";
import { computeWeightedOverallRating, recomputeSubcontractorAggregates } from "@/lib/sub-evaluation-utils";

const scoreSchema = z.object({
  criterionId: z.string().uuid("Tiêu chí không hợp lệ"),
  score: z.number().int().min(1, "Điểm tối thiểu 1").max(5, "Điểm tối đa 5"),
});

const createSchema = z.object({
  scores: z.array(scoreSchema).min(1, "Phải có ít nhất 1 tiêu chí"),
  comment: z.string().trim().max(5000).nullable().optional(),
  willHireAgain: z.boolean().optional(),
});

function canCreateEvaluation(role: string) {
  return role === UserRole.admin || role === UserRole.construction_manager || role === UserRole.engineer;
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireSubContractReadUser();
  if (error || !user) return error;

  const access = await canUserAccessSubContract(params.id, { id: user.id, role: user.role });
  if (!access.projectId) {
    return NextResponse.json({ message: "Không tìm thấy hợp đồng" }, { status: 404 });
  }
  if (!access.canAccess) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const [criteria, evaluations] = await Promise.all([
    prisma.evaluationCriterion.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
    prisma.subEvaluation.findMany({
      where: { subContractId: params.id },
      include: {
        evaluator: { select: { id: true, fullName: true, role: true } },
        scores: {
          include: {
            criterion: { select: { id: true, code: true, name: true, weight: true } },
          },
          orderBy: { criterion: { sortOrder: "asc" } },
        },
      },
      orderBy: [{ createdAt: "desc" }],
    }),
  ]);

  return NextResponse.json({
    criteria,
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
    canCreate: canCreateEvaluation(user.role),
    canDeleteAny: user.role === UserRole.admin,
  });
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireSubContractReadUser();
  if (error || !user) return error;

  const access = await canUserAccessSubContract(params.id, { id: user.id, role: user.role });
  if (!access.projectId) {
    return NextResponse.json({ message: "Không tìm thấy hợp đồng" }, { status: 404 });
  }
  if (!access.canAccess) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  if (!canCreateEvaluation(user.role)) {
    return NextResponse.json({ message: "Không có quyền đánh giá" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const payload = parsed.data;

  const [contract, criteria] = await Promise.all([
    prisma.subContract.findUnique({
      where: { id: params.id },
      select: { id: true, subcontractorId: true },
    }),
    prisma.evaluationCriterion.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, weight: true },
    }),
  ]);

  if (!contract) {
    return NextResponse.json({ message: "Không tìm thấy hợp đồng" }, { status: 404 });
  }

  if (criteria.length === 0) {
    return NextResponse.json({ message: "Chưa có tiêu chí đánh giá đang hoạt động" }, { status: 400 });
  }

  const uniqueScoreMap = new Map(payload.scores.map((item) => [item.criterionId, item.score]));
  if (uniqueScoreMap.size !== payload.scores.length) {
    return NextResponse.json({ message: "Mỗi tiêu chí chỉ được nhập 1 lần" }, { status: 400 });
  }

  const activeCriterionIds = new Set(criteria.map((item) => item.id));
  const submittedIds = new Set(payload.scores.map((item) => item.criterionId));

  if (submittedIds.size !== activeCriterionIds.size || Array.from(activeCriterionIds).some((id) => !submittedIds.has(id))) {
    return NextResponse.json({ message: "Điểm đánh giá phải đầy đủ theo bộ tiêu chí đang hoạt động" }, { status: 400 });
  }

  const overallRating = computeWeightedOverallRating({
    activeCriteria: criteria,
    scores: payload.scores,
  });

  if (overallRating === null) {
    return NextResponse.json({ message: "Không thể tính điểm tổng hợp" }, { status: 400 });
  }

  try {
    const evaluation = await prisma.$transaction(async (tx) => {
      const created = await tx.subEvaluation.create({
        data: {
          subContractId: params.id,
          evaluatorId: user.id,
          overallRating: new Prisma.Decimal(overallRating),
          comment: payload.comment || null,
          willHireAgain: payload.willHireAgain ?? true,
          scores: {
            createMany: {
              data: payload.scores.map((score) => ({
                criterionId: score.criterionId,
                score: score.score,
              })),
            },
          },
        },
        include: {
          evaluator: { select: { id: true, fullName: true, role: true } },
          scores: {
            include: {
              criterion: { select: { id: true, code: true, name: true, weight: true } },
            },
            orderBy: { criterion: { sortOrder: "asc" } },
          },
        },
      });

      await recomputeSubcontractorAggregates(tx, contract.subcontractorId);

      return created;
    });

    return NextResponse.json({
      evaluation: {
        ...evaluation,
        overallRating: Number(evaluation.overallRating),
        scores: evaluation.scores.map((score) => ({
          ...score,
          criterion: {
            ...score.criterion,
            weight: Number(score.criterion.weight),
          },
        })),
      },
      message: "Đã gửi đánh giá",
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json({ message: "Bạn đã đánh giá hợp đồng này rồi" }, { status: 409 });
    }

    return NextResponse.json({ message: "Không thể tạo đánh giá" }, { status: 500 });
  }
}
