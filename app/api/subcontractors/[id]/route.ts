import { Prisma, SubcontractorStatus, SubcontractorType } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSubcontractorRead, requireSubcontractorWrite } from "@/lib/subcontractor-auth";
import { normalizeSubcontractorState, serializeSubcontractor } from "@/lib/subcontractor-utils";

const phoneRegex = /^(\+?[0-9\s\-().]{8,20})$/;

const patchSchema = z.object({
  name: z.string().trim().min(2, "Tên thầu phụ tối thiểu 2 ký tự").optional(),
  type: z.nativeEnum(SubcontractorType).optional(),
  taxCode: z.string().trim().max(50).optional().nullable(),
  phone: z.string().trim().regex(phoneRegex, "SĐT không hợp lệ").optional(),
  altPhone: z.string().trim().regex(phoneRegex, "SĐT phụ không hợp lệ").optional().nullable(),
  email: z.string().trim().email("Email không hợp lệ").optional().nullable(),
  address: z.string().trim().max(500).optional().nullable(),
  bankName: z.string().trim().max(200).optional().nullable(),
  bankAccount: z.string().trim().max(100).optional().nullable(),
  bankAccountName: z.string().trim().max(200).optional().nullable(),
  status: z.nativeEnum(SubcontractorStatus).optional(),
  isActive: z.boolean().optional(),
  notes: z.string().trim().max(5000).optional().nullable(),
  specialtyIds: z.array(z.string().uuid()).optional(),
});

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const { error } = await requireSubcontractorRead();
  if (error) return error;

  const subcontractor = await prisma.subcontractor.findUnique({
    where: { id: params.id },
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
  });

  if (!subcontractor) {
    return NextResponse.json({ message: "Không tìm thấy thầu phụ" }, { status: 404 });
  }

  const evaluations = subcontractor.contracts.flatMap((contract) => contract.evaluations);
  const evaluationCount = evaluations.length;
  const hireAgainCount = evaluations.filter((x) => x.willHireAgain).length;

  return NextResponse.json({
    subcontractor: {
      ...serializeSubcontractor(subcontractor),
      specialties: subcontractor.specialties.map((m) => m.specialty),
      evaluationCount,
      hireAgainRate: evaluationCount > 0 ? Math.round((hireAgainCount / evaluationCount) * 100) : 0,
    },
  });
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const { error } = await requireSubcontractorWrite();
  if (error) return error;

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const existed = await prisma.subcontractor.findUnique({
    where: { id: params.id },
    select: { id: true, status: true, isActive: true },
  });

  if (!existed) {
    return NextResponse.json({ message: "Không tìm thấy thầu phụ" }, { status: 404 });
  }

  const payload = parsed.data;
  const specialtyIds = payload.specialtyIds ? Array.from(new Set(payload.specialtyIds)) : null;

  if (specialtyIds && specialtyIds.length > 0) {
    const count = await prisma.subcontractorSpecialty.count({
      where: { id: { in: specialtyIds }, isActive: true },
    });

    if (count !== specialtyIds.length) {
      return NextResponse.json({ message: "Có chuyên môn không tồn tại hoặc đã ngưng hoạt động" }, { status: 400 });
    }
  }

  const normalized = normalizeSubcontractorState({
    previousStatus: existed.status,
    previousIsActive: existed.isActive,
    status: payload.status,
    isActive: payload.isActive,
  });

  const subcontractor = await prisma.$transaction(async (tx) => {
    if (specialtyIds) {
      await tx.subcontractorSpecialtyMap.deleteMany({ where: { subcontractorId: params.id } });

      if (specialtyIds.length > 0) {
        await tx.subcontractorSpecialtyMap.createMany({
          data: specialtyIds.map((specialtyId) => ({ subcontractorId: params.id, specialtyId })),
        });
      }
    }

    return tx.subcontractor.update({
      where: { id: params.id },
      data: {
        ...(payload.name !== undefined ? { name: payload.name } : {}),
        ...(payload.type !== undefined ? { type: payload.type } : {}),
        ...(payload.taxCode !== undefined ? { taxCode: payload.taxCode || null } : {}),
        ...(payload.phone !== undefined ? { phone: payload.phone } : {}),
        ...(payload.altPhone !== undefined ? { altPhone: payload.altPhone || null } : {}),
        ...(payload.email !== undefined ? { email: payload.email || null } : {}),
        ...(payload.address !== undefined ? { address: payload.address || null } : {}),
        ...(payload.bankName !== undefined ? { bankName: payload.bankName || null } : {}),
        ...(payload.bankAccount !== undefined ? { bankAccount: payload.bankAccount || null } : {}),
        ...(payload.bankAccountName !== undefined ? { bankAccountName: payload.bankAccountName || null } : {}),
        ...(payload.notes !== undefined ? { notes: payload.notes || null } : {}),
        status: normalized.status,
        isActive: normalized.isActive,
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
    message: "Đã cập nhật thầu phụ",
  });
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const { error } = await requireSubcontractorWrite();
  if (error) return error;

  const existed = await prisma.subcontractor.findUnique({
    where: { id: params.id },
    select: { id: true, status: true },
  });

  if (!existed) {
    return NextResponse.json({ message: "Không tìm thấy thầu phụ" }, { status: 404 });
  }

  const nextStatus = existed.status === SubcontractorStatus.blacklisted ? SubcontractorStatus.blacklisted : SubcontractorStatus.inactive;

  await prisma.subcontractor.update({
    where: { id: params.id },
    data: {
      isActive: false,
      status: nextStatus,
    },
  });

  return NextResponse.json({ message: "Đã ngưng hoạt động thầu phụ" });
}
