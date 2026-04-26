import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { PaymentStatus, ProjectStatus, TaskStatus, UserRole } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, requireRole } from "@/lib/auth-helpers";
import { buildProjectAccessWhere } from "@/lib/project-permissions";

const updateSchema = z.object({
  section: z.enum(["owner", "project", "assignment", "reporting", "customer_portal"]),
  payload: z.record(z.string(), z.any()),
});

const ownerSchema = z.object({
  customerName: z.string().trim().min(2),
  customerPhone: z.string().trim().min(10),
  customerIdNumber: z.string().trim().optional().nullable(),
  address: z.string().trim().min(5),
});

const projectSchema = z.object({
  name: z.string().trim().min(3),
  areaM2: z.number().min(1),
  unitPrice: z.number().min(1_000_000),
  startDate: z.string(),
  actualEndDate: z.string().nullable().optional(),
  status: z.nativeEnum(ProjectStatus),
  notes: z.string().nullable().optional(),
});

const assignmentSchema = z.object({
  projectManagerId: z.string().uuid(),
  mainEngineerId: z.string().uuid(),
});

const reportingSchema = z.object({
  goLiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
});

const customerPortalSchema = z.object({
  customerPortalPassword: z.string().trim().optional().nullable(),
  customerPortalEnabled: z.boolean().optional(),
});

function addDays(baseDate: Date, offsetDays: number) {
  const d = new Date(baseDate);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d;
}

function normalizeDate(raw: string) {
  const [year, month, day] = raw.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
}

function normalizeNullableDate(raw: string | null) {
  if (!raw) return null;
  const [year, month, day] = raw.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }

  const accessWhere = buildProjectAccessWhere({ id: user.id, role: user.role });

  const project = await prisma.project.findFirst({
    where: {
      id: params.id,
      ...accessWhere,
    },
    include: {
      projectManager: {
        select: { id: true, fullName: true, email: true },
      },
      mainEngineer: {
        select: { id: true, fullName: true, email: true },
      },
    },
  });

  if (!project) {
    const exists = await prisma.project.findUnique({ where: { id: params.id }, select: { id: true } });
    if (exists) {
      return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
    }
    return NextResponse.json({ message: "Không tìm thấy dự án" }, { status: 404 });
  }

  const canViewFinancial = user.role === UserRole.admin || user.role === UserRole.accountant;

  return NextResponse.json({
    project: canViewFinancial
      ? project
      : {
          ...project,
          unitPrice: null,
          contractValue: null,
        },
  });
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }

  const isAdmin = user.role === UserRole.admin;
  const isConstructionManager = user.role === UserRole.construction_manager;

  const body = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const project = await prisma.project.findUnique({ where: { id: params.id } });
  if (!project) {
    return NextResponse.json({ message: "Không tìm thấy dự án" }, { status: 404 });
  }

  if (parsed.data.section === "owner") {
    const payload = ownerSchema.safeParse(parsed.data.payload);
    if (!payload.success) {
      return NextResponse.json({ message: payload.error.issues[0]?.message || "Dữ liệu chủ nhà không hợp lệ" }, { status: 400 });
    }

    const updated = await prisma.project.update({
      where: { id: params.id },
      data: {
        customerName: payload.data.customerName,
        customerPhone: payload.data.customerPhone,
        customerIdNumber: payload.data.customerIdNumber || null,
        address: payload.data.address,
      },
    });

    return NextResponse.json({ project: updated, message: "Đã cập nhật thông tin chủ nhà" });
  }

  if (parsed.data.section === "assignment") {
    const payload = assignmentSchema.safeParse(parsed.data.payload);
    if (!payload.success) {
      return NextResponse.json({ message: payload.error.issues[0]?.message || "Dữ liệu phân công không hợp lệ" }, { status: 400 });
    }

    const users = await prisma.user.findMany({
      where: {
        id: { in: [payload.data.projectManagerId, payload.data.mainEngineerId] },
        isActive: true,
      },
      select: { id: true },
    });

    if (users.length !== 2) {
      return NextResponse.json({ message: "GĐ quản lý hoặc KS chính không hợp lệ" }, { status: 400 });
    }

    const updated = await prisma.project.update({
      where: { id: params.id },
      data: {
        projectManagerId: payload.data.projectManagerId,
        mainEngineerId: payload.data.mainEngineerId,
      },
    });

    await prisma.task.updateMany({
      where: {
        projectId: params.id,
      },
      data: {
        assignedEngineerId: payload.data.mainEngineerId,
      },
    });

    return NextResponse.json({ project: updated, message: "Đã cập nhật phân công" });
  }

  if (parsed.data.section === "reporting") {
    if (!isAdmin) {
      return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
    }

    const payload = reportingSchema.safeParse(parsed.data.payload);
    if (!payload.success) {
      return NextResponse.json({ message: payload.error.issues[0]?.message || "Dữ liệu cấu hình báo cáo không hợp lệ" }, { status: 400 });
    }

    const updated = await prisma.project.update({
      where: { id: params.id },
      data: {
        goLiveDate: normalizeNullableDate(payload.data.goLiveDate),
      },
    });

    return NextResponse.json({ project: updated, message: "Đã cập nhật ngày go-live" });
  }

  if (parsed.data.section === "customer_portal") {
    if (!isAdmin && !isConstructionManager) {
      return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
    }
    const payload = customerPortalSchema.safeParse(parsed.data.payload);
    if (!payload.success) {
      return NextResponse.json({ message: payload.error.issues[0]?.message || "Dữ liệu cổng chủ nhà không hợp lệ" }, { status: 400 });
    }

    const updateData: {
      customerPortalPassword?: string | null;
      customerPortalEnabled?: boolean;
      customerPortalToken?: string;
    } = {};

    if (payload.data.customerPortalPassword !== undefined) {
      const raw = (payload.data.customerPortalPassword || "").trim();
      updateData.customerPortalPassword = raw ? await bcrypt.hash(raw, 10) : null;
    }

    if (payload.data.customerPortalEnabled !== undefined) {
      updateData.customerPortalEnabled = payload.data.customerPortalEnabled;
    }

    if ((parsed.data.payload as { resetToken?: boolean }).resetToken) {
      updateData.customerPortalToken = randomUUID();
      await prisma.customerSession.deleteMany({ where: { projectId: params.id } });
      await prisma.customerLoginAttempt.deleteMany({ where: { projectId: params.id } });
    }

    const updated = await prisma.project.update({
      where: { id: params.id },
      data: updateData,
    });

    return NextResponse.json({ project: updated, message: "Đã cập nhật cổng chủ nhà" });
  }

  const payload = projectSchema.safeParse(parsed.data.payload);
  if (!payload.success) {
    return NextResponse.json({ message: payload.error.issues[0]?.message || "Dữ liệu dự án không hợp lệ" }, { status: 400 });
  }

  const startDate = normalizeDate(payload.data.startDate);
  const previousStartDate = new Date(project.startDate);
  previousStartDate.setHours(0, 0, 0, 0);
  const isStartDateChanged = previousStartDate.getTime() !== startDate.getTime();

  const contractValue = Math.round(payload.data.areaM2 * payload.data.unitPrice);
  const expectedEndDate = addDays(startDate, 120);

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.project.update({
      where: { id: params.id },
      data: {
        name: payload.data.name,
        areaM2: payload.data.areaM2,
        unitPrice: payload.data.unitPrice,
        contractValue,
        startDate,
        expectedEndDate,
        actualEndDate: payload.data.actualEndDate ? normalizeDate(payload.data.actualEndDate) : null,
        status: payload.data.status,
        notes: payload.data.notes ?? null,
      },
    });

    if (isStartDateChanged) {
      const tasks = await tx.task.findMany({
        where: { projectId: params.id },
        select: { id: true, offsetDays: true, durationDays: true },
      });

      for (const task of tasks) {
        const plannedStartDate = addDays(startDate, task.offsetDays);
        const plannedEndDate = addDays(plannedStartDate, task.durationDays - 1);

        await tx.task.update({
          where: { id: task.id },
          data: {
            plannedStartDate,
            plannedEndDate,
          },
        });
      }

      const payments = await tx.paymentSchedule.findMany({
        where: { projectId: params.id },
        select: { id: true, dayOffset: true },
      });

      for (const payment of payments) {
        await tx.paymentSchedule.update({
          where: { id: payment.id },
          data: {
            expectedDate: addDays(startDate, payment.dayOffset),
          },
        });
      }
    }

    const paymentTemplate = [0.15, 0.2, 0.2, 0.2, 0.15, 0.1];
    const amounts = paymentTemplate.map((p) => Math.round(contractValue * p));
    const partial = amounts.slice(0, 5).reduce((s, x) => s + x, 0);
    amounts[5] = contractValue - partial;

    const paymentRows = await tx.paymentSchedule.findMany({
      where: { projectId: params.id },
      orderBy: { phaseNumber: "asc" },
      select: { id: true, phaseNumber: true },
    });

    for (const row of paymentRows) {
      const idx = row.phaseNumber - 1;
      if (idx >= 0 && idx < amounts.length) {
        await tx.paymentSchedule.update({
          where: { id: row.id },
          data: {
            amount: amounts[idx],
          },
        });
      }
    }

    return updated;
  });

  return NextResponse.json({
    project: result,
    message: isStartDateChanged
      ? "Đã cập nhật dự án. Ngày dự kiến của 69 công tác và 6 đợt thanh toán đã được cập nhật theo ngày khởi công mới."
      : "Đã cập nhật dự án",
  });
}
