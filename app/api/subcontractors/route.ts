import { Prisma, SubcontractorStatus, SubcontractorType } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSubcontractorRead, requireSubcontractorWrite } from "@/lib/subcontractor-auth";
import { generateNextSubcontractorCode, normalizeSubcontractorState, serializeSubcontractor } from "@/lib/subcontractor-utils";

const phoneRegex = /^(\+?[0-9\s\-().]{8,20})$/;

const createSchema = z.object({
  name: z.string().trim().min(2, "Tên thầu phụ tối thiểu 2 ký tự"),
  type: z.nativeEnum(SubcontractorType).optional(),
  taxCode: z.string().trim().max(50).optional().nullable(),
  phone: z.string().trim().regex(phoneRegex, "SĐT không hợp lệ"),
  altPhone: z.string().trim().regex(phoneRegex, "SĐT phụ không hợp lệ").optional().nullable(),
  email: z.string().trim().email("Email không hợp lệ").optional().nullable(),
  address: z.string().trim().max(500).optional().nullable(),
  bankName: z.string().trim().max(200).optional().nullable(),
  bankAccount: z.string().trim().max(100).optional().nullable(),
  bankAccountName: z.string().trim().max(200).optional().nullable(),
  status: z.nativeEnum(SubcontractorStatus).optional(),
  isActive: z.boolean().optional(),
  notes: z.string().trim().max(5000).optional().nullable(),
  specialtyIds: z.array(z.string().uuid()).default([]),
});

function parseStatus(input: string | null) {
  if (!input || input === "all") return null;
  if ([SubcontractorStatus.active, SubcontractorStatus.inactive, SubcontractorStatus.blacklisted].includes(input as SubcontractorStatus)) {
    return input as SubcontractorStatus;
  }
  return null;
}

export async function GET(request: Request) {
  const { error } = await requireSubcontractorRead();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const search = (searchParams.get("search") || "").trim();
  const specialtyId = (searchParams.get("specialty") || "").trim();
  const status = parseStatus(searchParams.get("status"));
  const includeInactive = searchParams.get("includeInactive") === "1";

  const where: Prisma.SubcontractorWhereInput = {
    ...(includeInactive ? {} : { isActive: true }),
    ...(status ? { status } : {}),
    ...(specialtyId
      ? {
          specialties: {
            some: {
              specialtyId,
            },
          },
        }
      : {}),
    ...(search
      ? {
          OR: [
            { code: { contains: search, mode: "insensitive" } },
            { name: { contains: search, mode: "insensitive" } },
            { phone: { contains: search, mode: "insensitive" } },
            { email: { contains: search, mode: "insensitive" } },
            { taxCode: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const subcontractors = await prisma.subcontractor.findMany({
    where,
    include: {
      specialties: {
        include: {
          specialty: {
            select: { id: true, code: true, name: true, icon: true },
          },
        },
      },
      contracts: {
        select: {
          evaluations: {
            select: {
              willHireAgain: true,
            },
          },
        },
      },
    },
    orderBy: [{ isActive: "desc" }, { status: "asc" }, { createdAt: "desc" }],
  });

  return NextResponse.json({
    subcontractors: subcontractors.map((item) => {
      const evaluations = item.contracts.flatMap((contract) => contract.evaluations);
      const evaluationCount = evaluations.length;
      const hireAgainCount = evaluations.filter((x) => x.willHireAgain).length;
      return {
        ...serializeSubcontractor(item),
        specialties: item.specialties.map((m) => m.specialty),
        evaluationCount,
        hireAgainRate: evaluationCount > 0 ? Math.round((hireAgainCount / evaluationCount) * 100) : 0,
      };
    }),
  });
}

export async function POST(request: Request) {
  const { user, error } = await requireSubcontractorWrite();
  if (error || !user) return error;

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const payload = parsed.data;
  const specialtyIds = Array.from(new Set(payload.specialtyIds));

  if (specialtyIds.length > 0) {
    const count = await prisma.subcontractorSpecialty.count({
      where: { id: { in: specialtyIds }, isActive: true },
    });

    if (count !== specialtyIds.length) {
      return NextResponse.json({ message: "Có chuyên môn không tồn tại hoặc đã ngưng hoạt động" }, { status: 400 });
    }
  }

  try {
    const subcontractor = await prisma.$transaction(async (tx) => {
      const code = await generateNextSubcontractorCode(tx);
      const normalized = normalizeSubcontractorState({ status: payload.status, isActive: payload.isActive });

      return tx.subcontractor.create({
        data: {
          code,
          name: payload.name,
          type: payload.type || SubcontractorType.individual,
          taxCode: payload.taxCode || null,
          phone: payload.phone,
          altPhone: payload.altPhone || null,
          email: payload.email || null,
          address: payload.address || null,
          bankName: payload.bankName || null,
          bankAccount: payload.bankAccount || null,
          bankAccountName: payload.bankAccountName || null,
          status: normalized.status,
          isActive: normalized.isActive,
          notes: payload.notes || null,
          createdBy: user.id,
          specialties: specialtyIds.length
            ? {
                createMany: {
                  data: specialtyIds.map((specialtyId) => ({ specialtyId })),
                },
              }
            : undefined,
        },
        include: {
          specialties: {
            include: {
              specialty: {
                select: { id: true, code: true, name: true, icon: true },
              },
            },
          },
        },
      });
    });

    return NextResponse.json({
      subcontractor: {
        ...serializeSubcontractor(subcontractor),
        specialties: subcontractor.specialties.map((m) => m.specialty),
      },
      message: "Đã tạo thầu phụ",
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ message: "Mã thầu phụ bị trùng, vui lòng thử lại" }, { status: 409 });
    }
    return NextResponse.json({ message: "Không thể tạo thầu phụ" }, { status: 500 });
  }
}
