import { Prisma, SubContractStatus, SubContractUnit, SubPaymentStatus, UserRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { canUserAccessProjectSubContracts, requireSubContractReadUser, requireSubContractWriteUser } from "@/lib/sub-contract-auth";
import {
  canViewSubContractFinancial,
  generateNextSubContractCode,
  parseSubContractStatus,
  parseSubContractUnit,
  serializeSubContract,
} from "@/lib/sub-contract-utils";
import { fmtMoney, logProjectActivity } from "@/lib/project-activity-log";

const createSchema = z.object({
  subcontractorId: z.string().uuid("Thầu phụ không hợp lệ"),
  title: z.string().trim().min(3, "Tiêu đề tối thiểu 3 ký tự"),
  scopeOfWork: z.string().trim().min(5, "Phạm vi công việc tối thiểu 5 ký tự"),
  unit: z.nativeEnum(SubContractUnit).optional(),
  unitPrice: z.number().nonnegative().nullable().optional(),
  quantity: z.number().positive().nullable().optional(),
  contractValue: z.number().positive("Giá trị hợp đồng phải > 0"),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  expectedEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().trim().max(5000).nullable().optional(),
  taskIds: z.array(z.string().uuid()).optional().default([]),
});

function normalizeDate(raw: string) {
  const [year, month, day] = raw.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireSubContractReadUser();
  if (error || !user) return error;

  const canAccess = await canUserAccessProjectSubContracts(params.id, { id: user.id, role: user.role });
  if (!canAccess) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const status = parseSubContractStatus(searchParams.get("status"));
  const search = (searchParams.get("search") || "").trim();

  const rows = await prisma.subContract.findMany({
    where: {
      projectId: params.id,
      ...(status ? { status } : {}),
      ...(search
        ? {
            OR: [
              { code: { contains: search, mode: "insensitive" } },
              { title: { contains: search, mode: "insensitive" } },
              { scopeOfWork: { contains: search, mode: "insensitive" } },
              { subcontractor: { name: { contains: search, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    include: {
      subcontractor: {
        select: { id: true, code: true, name: true, phone: true },
      },
      linkedTasks: {
        include: {
          task: {
            select: { id: true, code: true, name: true, status: true },
          },
        },
      },
      _count: {
        select: { files: true, payments: true, evaluations: true },
      },
    },
    orderBy: [{ createdAt: "desc" }],
  });

  const canViewFinancial = canViewSubContractFinancial(user.role);

  // Đã thanh toán từng HĐ = Σ actualAmount các đợt (gồm đợt paid + tạm ứng dở), bỏ đợt huỷ.
  const contractIds = rows.map((r) => r.id);
  const paidAgg = contractIds.length
    ? await prisma.subPayment.groupBy({
        by: ["subContractId"],
        where: {
          subContractId: { in: contractIds },
          status: { not: SubPaymentStatus.cancelled },
          actualAmount: { not: null },
        },
        _sum: { actualAmount: true },
      })
    : [];
  const paidByContract = new Map(paidAgg.map((p) => [p.subContractId, Number(p._sum.actualAmount || 0)]));

  return NextResponse.json({
    contracts: rows.map((row) => {
      const serialized = serializeSubContract(row, canViewFinancial);
      return {
        ...serialized,
        unit: canViewFinancial ? serialized.unit : null,
        paidTotal: canViewFinancial ? (paidByContract.get(row.id) || 0) : null,
        subcontractor: row.subcontractor,
        linkedTasks: row.linkedTasks.map((item) => item.task),
        fileCount: row._count.files,
        paymentCount: row._count.payments,
        evaluationCount: row._count.evaluations,
      };
    }),
  });
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireSubContractWriteUser();
  if (error || !user) return error;

  const canAccess = await canUserAccessProjectSubContracts(params.id, { id: user.id, role: user.role });
  if (!canAccess) {
    return NextResponse.json({ message: "Không có quyền tạo hợp đồng trong dự án này" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const payload = parsed.data;
  const taskIds = Array.from(new Set(payload.taskIds || []));

  const [project, subcontractor] = await Promise.all([
    prisma.project.findUnique({ where: { id: params.id }, select: { id: true } }),
    prisma.subcontractor.findFirst({
      where: { id: payload.subcontractorId, isActive: true },
      select: { id: true },
    }),
  ]);

  if (!project) {
    return NextResponse.json({ message: "Không tìm thấy dự án" }, { status: 404 });
  }

  if (!subcontractor) {
    return NextResponse.json({ message: "Không tìm thấy thầu phụ hoặc đã ngưng" }, { status: 400 });
  }

  if (taskIds.length > 0) {
    const count = await prisma.task.count({
      where: {
        id: { in: taskIds },
        projectId: params.id,
        isActive: true,
      },
    });

    if (count !== taskIds.length) {
      return NextResponse.json({ message: "Có công việc không thuộc dự án hoặc đã ngưng" }, { status: 400 });
    }
  }

  const startDate = normalizeDate(payload.startDate);
  const expectedEndDate = normalizeDate(payload.expectedEndDate);

  if (expectedEndDate.getTime() < startDate.getTime()) {
    return NextResponse.json({ message: "Ngày kết thúc dự kiến phải >= ngày bắt đầu" }, { status: 400 });
  }

  try {
    const created = await prisma.$transaction(async (tx) => {
      const code = await generateNextSubContractCode(tx);

      const row = await tx.subContract.create({
        data: {
          code,
          projectId: params.id,
          subcontractorId: payload.subcontractorId,
          title: payload.title,
          scopeOfWork: payload.scopeOfWork,
          unit: parseSubContractUnit(payload.unit),
          unitPrice: payload.unitPrice ?? null,
          quantity: payload.quantity ?? null,
          contractValue: new Prisma.Decimal(payload.contractValue),
          startDate,
          expectedEndDate,
          status: SubContractStatus.draft,
          notes: payload.notes || null,
          createdBy: user.id,
          linkedTasks: taskIds.length
            ? {
                createMany: {
                  data: taskIds.map((taskId) => ({ taskId })),
                },
              }
            : undefined,
        },
        include: {
          subcontractor: {
            select: { id: true, code: true, name: true, phone: true },
          },
          linkedTasks: {
            include: {
              task: {
                select: { id: true, code: true, name: true, status: true },
              },
            },
          },
        },
      });

      const totalContracts = await tx.subContract.count({
        where: { subcontractorId: payload.subcontractorId },
      });

      await tx.subcontractor.update({
        where: { id: payload.subcontractorId },
        data: { totalContracts },
      });

      await logProjectActivity(tx, {
        projectId: params.id,
        actorId: user.id,
        entity: "sub_contract",
        entityId: row.id,
        action: "create",
        summary: `Tạo HĐ thầu phụ ${row.code} "${row.title}" — thầu phụ ${row.subcontractor.name}, giá trị ${fmtMoney(row.contractValue)}`,
        metadata: { code: row.code, contractValue: row.contractValue.toString(), subcontractorId: row.subcontractorId, linkedTaskCount: taskIds.length },
      });

      return row;
    });

    const serialized = serializeSubContract(created, true);

    return NextResponse.json({
      contract: {
        ...serialized,
        subcontractor: created.subcontractor,
        linkedTasks: created.linkedTasks.map((item) => item.task),
      },
      message: "Đã tạo hợp đồng nháp",
    });
  } catch {
    return NextResponse.json({ message: "Không thể tạo hợp đồng" }, { status: 500 });
  }
}
