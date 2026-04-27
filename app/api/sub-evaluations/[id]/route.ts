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

const patchSchema = z.object({
  scores: z.array(scoreSchema).min(1, "Phải có ít nhất 1 tiêu chí").optional(),
  comment: z.string().trim().max(5000).nullable().optional(),
  willHireAgain: z.boolean().optional(),
});

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireSubContractReadUser();
  if (error || !user) return error;

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const payload = parsed.data;

  const existed = await prisma.subEvaluation.findUnique({
    where: { id: params.id },
    include: {
      subContract: {
        select: { id: true, subcontractorId: true },
      },
    },
  });

  if (!existed) {
    return NextResponse.json({ message: "Không tìm thấy đánh giá" }, { status: 404 });
  }

  const access = await canUserAccessSubContract(existed.subContractId, { id: user.id, role: user.role });
  if (!access.canAccess) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  if (existed.evaluatorId !== user.id) {
    return NextResponse.json({ message: "Chỉ người tạo mới được sửa đánh giá" }, { status: 403 });
  }

  const hasScorePatch = Array.isArray(payload.scores);

  let criteria: Array<{ id: string; weight: Prisma.Decimal | number }> = [];
  if (hasScorePatch) {
    criteria = await prisma.evaluationCriterion.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, weight: true },
    });

    if (criteria.length === 0) {
      return NextResponse.json({ message: "Chưa có tiêu chí đánh giá đang hoạt động" }, { status: 400 });
    }

    const uniqueScoreMap = new Map(payload.scores!.map((item) => [item.criterionId, item.score]));
    if (uniqueScoreMap.size !== payload.scores!.length) {
      return NextResponse.json({ message: "Mỗi tiêu chí chỉ được nhập 1 lần" }, { status: 400 });
    }

    const activeCriterionIds = new Set(criteria.map((item) => item.id));
    const submittedIds = new Set(payload.scores!.map((item) => item.criterionId));

    if (submittedIds.size !== activeCriterionIds.size || Array.from(activeCriterionIds).some((id) => !submittedIds.has(id))) {
      return NextResponse.json({ message: "Điểm đánh giá phải đầy đủ theo bộ tiêu chí đang hoạt động" }, { status: 400 });
    }
  }

  const evaluation = await prisma.$transaction(async (tx) => {
    let nextOverall = Number(existed.overallRating);
    if (hasScorePatch) {
      const computed = computeWeightedOverallRating({
        activeCriteria: criteria,
        scores: payload.scores!,
      });

      if (computed === null) {
        throw new Error("INVALID_RATING");
      }
      nextOverall = computed;

      await tx.subEvaluationScore.deleteMany({
        where: { evaluationId: existed.id },
      });

      await tx.subEvaluationScore.createMany({
        data: payload.scores!.map((score) => ({
          evaluationId: existed.id,
          criterionId: score.criterionId,
          score: score.score,
        })),
      });
    }

    const updated = await tx.subEvaluation.update({
      where: { id: existed.id },
      data: {
        ...(hasScorePatch ? { overallRating: new Prisma.Decimal(nextOverall) } : {}),
        ...(payload.comment !== undefined ? { comment: payload.comment || null } : {}),
        ...(payload.willHireAgain !== undefined ? { willHireAgain: payload.willHireAgain } : {}),
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

    await recomputeSubcontractorAggregates(tx, existed.subContract.subcontractorId);
    return updated;
  }).catch((err) => {
    if (err instanceof Error && err.message === "INVALID_RATING") {
      return null;
    }
    throw err;
  });

  if (!evaluation) {
    return NextResponse.json({ message: "Không thể tính điểm tổng hợp" }, { status: 400 });
  }

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
    message: "Đã cập nhật đánh giá",
  });
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireSubContractReadUser();
  if (error || !user) return error;

  const existed = await prisma.subEvaluation.findUnique({
    where: { id: params.id },
    include: {
      subContract: {
        select: { id: true, subcontractorId: true },
      },
    },
  });

  if (!existed) {
    return NextResponse.json({ message: "Không tìm thấy đánh giá" }, { status: 404 });
  }

  const access = await canUserAccessSubContract(existed.subContractId, { id: user.id, role: user.role });
  if (!access.canAccess) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const canDelete = user.role === UserRole.admin || existed.evaluatorId === user.id;
  if (!canDelete) {
    return NextResponse.json({ message: "Chỉ admin hoặc người tạo mới được xóa đánh giá" }, { status: 403 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.subEvaluation.delete({ where: { id: existed.id } });
    await recomputeSubcontractorAggregates(tx, existed.subContract.subcontractorId);
  });

  return NextResponse.json({ message: "Đã xóa đánh giá" });
}
