import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { PaymentStatus, Prisma, ProjectMemberRole, ProjectRoleType, ProjectStatus, TaskStatus, UserRole } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, requireRole } from "@/lib/auth-helpers";
import { buildProjectAccessWhere } from "@/lib/project-permissions";
import { buildDiff, fmtDate, fmtMoney, joinSummary, logProjectActivity } from "@/lib/project-activity-log";

const updateSchema = z.object({
  section: z.enum(["owner", "project", "assignment", "reporting", "customer_portal", "contract_meta", "payment_schedules", "members"]),
  payload: z.record(z.string(), z.any()),
});

const paymentRowSchema = z.object({
  id: z.string().uuid().optional(),
  type: z.enum(["contract", "addendum"]).optional().default("contract"),
  installmentNo: z.number().int().min(1, "Đợt phải >= 1"),
  description: z.string().trim().min(1, "Nội dung thanh toán là bắt buộc"),
  percent: z.number().min(0, "% phải >= 0").max(100, "% phải <= 100").optional().nullable(),
  amount: z.number().positive("Số tiền phải > 0").optional().nullable(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày hạn phải dạng yyyy-mm-dd").optional().nullable(),
  paymentNote: z.string().optional().nullable(),
});

const paymentSchedulesSchema = z.object({
  rows: z.array(paymentRowSchema),
});

const ownerSchema = z.object({
  customerName: z.string().trim().min(2, "Tên chủ nhà tối thiểu 2 ký tự"),
  customerPhone: z.string().trim().min(10, "SĐT chủ nhà tối thiểu 10 ký tự"),
  customerIdNumber: z.string().trim().optional().nullable(),
  customerPermanentAddress: z.string().trim().optional().nullable(),
  address: z.string().trim().min(5, "Địa chỉ công trình tối thiểu 5 ký tự"),
});

const contractMetaSchema = z.object({
  contractSignDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày ký HĐ phải dạng yyyy-mm-dd").optional().nullable(),
  warrantyTotalMonths: z.number().int().min(0, "Số tháng bảo hành phải >= 0").optional(),
  warrantyStructureYears: z.number().int().min(0, "Bảo hành kết cấu phải >= 0 năm").optional(),
  warrantyLeakYears: z.number().int().min(0, "Bảo hành chống thấm phải >= 0 năm").optional(),
});

const projectSchema = z.object({
  name: z.string().trim().min(3, "Tên dự án tối thiểu 3 ký tự"),
  contractValue: z.number().min(1, "Giá trị HĐ phải > 0"),
  startDate: z.string().min(1, "Ngày khởi công là bắt buộc"),
  expectedEndDate: z.string().min(1, "Ngày bàn giao dự kiến là bắt buộc"),
  plannedDeadline: z.string().nullable().optional(),
  actualEndDate: z.string().nullable().optional(),
  status: z.nativeEnum(ProjectStatus, { error: () => "Trạng thái không hợp lệ" }),
  notes: z.string().nullable().optional(),
});

const assignmentSchema = z.object({
  projectManagerId: z.string().uuid("GĐ Thi Công không hợp lệ"),
  mainEngineerId: z.string().uuid("KS chính không hợp lệ"),
});

const membersSyncSchema = z.object({
  rows: z.array(
    z.object({
      userId: z.string().uuid("User không hợp lệ"),
      roleInProject: z.nativeEnum(ProjectMemberRole),
    }),
  ),
});

const reportingSchema = z.object({
  goLiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày go-live phải dạng yyyy-mm-dd").nullable(),
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

    const existingMeta = (project.contractMeta && typeof project.contractMeta === "object" && !Array.isArray(project.contractMeta) ? project.contractMeta : {}) as Record<string, unknown>;
    const nextMeta = { ...existingMeta };
    const permanentAddress = payload.data.customerPermanentAddress?.trim() || null;
    if (permanentAddress) {
      nextMeta.customerPermanentAddress = permanentAddress;
    } else {
      delete nextMeta.customerPermanentAddress;
    }

    const updated = await prisma.project.update({
      where: { id: params.id },
      data: {
        customerName: payload.data.customerName,
        customerPhone: payload.data.customerPhone,
        customerIdNumber: payload.data.customerIdNumber || null,
        address: payload.data.address,
        contractMeta: Object.keys(nextMeta).length > 0 ? (nextMeta as Prisma.InputJsonValue) : Prisma.JsonNull,
      },
    });

    const { diff, lines } = buildDiff(
      { customerName: project.customerName, customerPhone: project.customerPhone, customerIdNumber: project.customerIdNumber, address: project.address, customerPermanentAddress: (existingMeta.customerPermanentAddress as string | undefined) ?? null },
      { customerName: updated.customerName, customerPhone: updated.customerPhone, customerIdNumber: updated.customerIdNumber, address: updated.address, customerPermanentAddress: permanentAddress },
      [
        { key: "customerName", label: "Tên chủ nhà" },
        { key: "customerPhone", label: "SĐT" },
        { key: "customerIdNumber", label: "CCCD/CMND" },
        { key: "address", label: "Địa chỉ công trình" },
        { key: "customerPermanentAddress", label: "Địa chỉ thường trú" },
      ],
    );
    if (Object.keys(diff).length > 0) {
      await logProjectActivity(prisma, {
        projectId: project.id,
        actorId: user.id,
        entity: "project",
        entityId: project.id,
        action: "update",
        summary: joinSummary("Sửa thông tin chủ nhà", lines, "Cập nhật thông tin chủ nhà"),
        diff,
        metadata: { section: "owner" },
      });
    }

    return NextResponse.json({ project: updated, message: "Đã cập nhật thông tin chủ nhà" });
  }

  if (parsed.data.section === "contract_meta") {
    if (!isAdmin) {
      return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
    }

    const payload = contractMetaSchema.safeParse(parsed.data.payload);
    if (!payload.success) {
      return NextResponse.json({ message: payload.error.issues[0]?.message || "Dữ liệu điều khoản HĐ không hợp lệ" }, { status: 400 });
    }

    const existingMeta = (project.contractMeta && typeof project.contractMeta === "object" && !Array.isArray(project.contractMeta) ? project.contractMeta : {}) as Record<string, unknown>;
    const nextMeta = { ...existingMeta };
    if (payload.data.contractSignDate) {
      nextMeta.contractSignDate = payload.data.contractSignDate;
    } else {
      delete nextMeta.contractSignDate;
    }
    if (payload.data.warrantyTotalMonths !== undefined) nextMeta.warrantyTotalMonths = payload.data.warrantyTotalMonths;
    if (payload.data.warrantyStructureYears !== undefined) nextMeta.warrantyStructureYears = payload.data.warrantyStructureYears;
    if (payload.data.warrantyLeakYears !== undefined) nextMeta.warrantyLeakYears = payload.data.warrantyLeakYears;

    const updated = await prisma.project.update({
      where: { id: params.id },
      data: {
        contractMeta: Object.keys(nextMeta).length > 0 ? (nextMeta as Prisma.InputJsonValue) : Prisma.JsonNull,
      },
    });

    const { diff, lines } = buildDiff(
      {
        contractSignDate: existingMeta.contractSignDate ?? null,
        warrantyTotalMonths: existingMeta.warrantyTotalMonths ?? null,
        warrantyStructureYears: existingMeta.warrantyStructureYears ?? null,
        warrantyLeakYears: existingMeta.warrantyLeakYears ?? null,
      },
      {
        contractSignDate: nextMeta.contractSignDate ?? null,
        warrantyTotalMonths: nextMeta.warrantyTotalMonths ?? null,
        warrantyStructureYears: nextMeta.warrantyStructureYears ?? null,
        warrantyLeakYears: nextMeta.warrantyLeakYears ?? null,
      },
      [
        { key: "contractSignDate", label: "Ngày ký HĐ" },
        { key: "warrantyTotalMonths", label: "Tổng tháng bảo hành" },
        { key: "warrantyStructureYears", label: "Bảo hành kết cấu (năm)" },
        { key: "warrantyLeakYears", label: "Bảo hành chống thấm (năm)" },
      ],
    );
    if (Object.keys(diff).length > 0) {
      await logProjectActivity(prisma, {
        projectId: project.id,
        actorId: user.id,
        entity: "project",
        entityId: project.id,
        action: "update",
        summary: joinSummary("Sửa điều khoản HĐ", lines, "Cập nhật điều khoản HĐ"),
        diff,
        metadata: { section: "contract_meta" },
      });
    }

    return NextResponse.json({ project: updated, message: "Đã cập nhật điều khoản HĐ" });
  }

  if (parsed.data.section === "payment_schedules") {
    if (!isAdmin) {
      return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
    }

    const payload = paymentSchedulesSchema.safeParse(parsed.data.payload);
    if (!payload.success) {
      return NextResponse.json({ message: payload.error.issues[0]?.message || "Dữ liệu lịch thanh toán không hợp lệ" }, { status: 400 });
    }

    const projectStartDate = new Date(project.startDate);
    const contractValue = project.contractValue ? Number(project.contractValue) : 0;

    const diffDays = (from: Date, to: Date) => {
      const a = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
      const b = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
      return Math.max(0, Math.floor((b - a) / (24 * 60 * 60 * 1000)));
    };

    const existingRowsFull = await prisma.paymentSchedule.findMany({
      where: { projectId: params.id },
    });
    const existingFullById = new Map(existingRowsFull.map((row) => [row.id, row]));
    const existingRows = existingRowsFull.map((r) => ({ id: r.id, paidAt: r.paidAt, actualPaidDate: r.actualPaidDate }));
    const existingById = new Map(existingRows.map((row) => [row.id, row]));
    const submittedIds = new Set<string>();

    await prisma.$transaction(async (tx) => {
      for (const row of payload.data.rows) {
        const amount = row.amount && row.amount > 0 ? row.amount : 0;
        const percent = row.percent !== null && row.percent !== undefined ? row.percent : contractValue > 0 ? (amount / contractValue) * 100 : 0;
        const dueDate = row.dueDate ? normalizeDate(row.dueDate) : null;
        const expectedDate = dueDate;
        const dayOffset = dueDate ? diffDays(projectStartDate, dueDate) : null;

        if (row.id && existingById.has(row.id)) {
          submittedIds.add(row.id);
          const before = existingFullById.get(row.id)!;
          const updated = await tx.paymentSchedule.update({
            where: { id: row.id },
            data: {
              type: row.type,
              installmentNo: row.installmentNo,
              description: row.description,
              milestoneDescription: row.description,
              percent,
              amount,
              dueDate,
              expectedDate,
              dayOffset,
              paymentNote: row.paymentNote || null,
              phaseNumber: row.installmentNo,
            },
          });
          const { diff, lines } = buildDiff(
            { installmentNo: before.installmentNo, description: before.description, percent: before.percent ? Number(before.percent) : null, amount: before.amount ? Number(before.amount) : null, dueDate: before.dueDate },
            { installmentNo: updated.installmentNo, description: updated.description, percent: updated.percent ? Number(updated.percent) : null, amount: updated.amount ? Number(updated.amount) : null, dueDate: updated.dueDate },
            [
              { key: "installmentNo", label: "Đợt" },
              { key: "description", label: "Mô tả" },
              { key: "percent", label: "%" },
              { key: "amount", label: "Số tiền", format: fmtMoney },
              { key: "dueDate", label: "Hạn", format: fmtDate },
            ],
          );
          if (Object.keys(diff).length > 0) {
            await logProjectActivity(tx, {
              projectId: params.id,
              actorId: user.id,
              entity: "payment_schedule",
              entityId: updated.id,
              action: "update",
              summary: joinSummary(`Sửa đợt TT #${updated.installmentNo}`, lines, `Cập nhật đợt TT #${updated.installmentNo}`),
              diff,
            });
          }
        } else {
          const created = await tx.paymentSchedule.create({
            data: {
              projectId: params.id,
              type: row.type,
              installmentNo: row.installmentNo,
              phaseNumber: row.installmentNo,
              description: row.description,
              milestoneDescription: row.description,
              percent,
              amount,
              dueDate,
              expectedDate,
              dayOffset,
              paymentNote: row.paymentNote || null,
              status: PaymentStatus.pending,
              createdBy: user.id,
            },
          });
          await logProjectActivity(tx, {
            projectId: params.id,
            actorId: user.id,
            entity: "payment_schedule",
            entityId: created.id,
            action: "create",
            summary: `Thêm đợt TT #${created.installmentNo} "${created.description}" — ${fmtMoney(created.amount)}${dueDate ? `, hạn ${fmtDate(dueDate)}` : ""}`,
          });
        }
      }

      const toDelete = existingRows.filter((row) => !submittedIds.has(row.id) && !row.paidAt && !row.actualPaidDate);
      if (toDelete.length > 0) {
        for (const row of toDelete) {
          const full = existingFullById.get(row.id)!;
          await logProjectActivity(tx, {
            projectId: params.id,
            actorId: user.id,
            entity: "payment_schedule",
            entityId: row.id,
            action: "delete",
            summary: `Xóa đợt TT #${full.installmentNo} "${full.description}" — ${fmtMoney(full.amount)}`,
            snapshot: full,
          });
        }
        await tx.paymentSchedule.deleteMany({
          where: { id: { in: toDelete.map((row) => row.id) } },
        });
      }
    });

    return NextResponse.json({ message: "Đã cập nhật lịch thanh toán" });
  }

  if (parsed.data.section === "assignment") {
    if (!isAdmin) {
      return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
    }

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
      return NextResponse.json({ message: "GĐ Thi Công hoặc KS chính không hợp lệ" }, { status: 400 });
    }

    const prevPm = await prisma.user.findUnique({ where: { id: project.projectManagerId }, select: { id: true, fullName: true } });
    const prevEng = await prisma.user.findUnique({ where: { id: project.mainEngineerId }, select: { id: true, fullName: true } });
    const nextPm = await prisma.user.findUnique({ where: { id: payload.data.projectManagerId }, select: { id: true, fullName: true } });
    const nextEng = await prisma.user.findUnique({ where: { id: payload.data.mainEngineerId }, select: { id: true, fullName: true } });

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.project.update({
        where: { id: params.id },
        data: {
          projectManagerId: payload.data.projectManagerId,
          mainEngineerId: payload.data.mainEngineerId,
        },
      });

      await tx.task.updateMany({
        where: {
          projectId: params.id,
        },
        data: {
          assignedEngineerId: payload.data.mainEngineerId,
        },
      });

      await tx.projectMemberAssignment.deleteMany({
        where: {
          projectId: params.id,
          role: ProjectRoleType.pm_construction_manager,
          isPrimary: true,
          userId: { not: payload.data.projectManagerId },
        },
      });
      await tx.projectMemberAssignment.deleteMany({
        where: {
          projectId: params.id,
          role: ProjectRoleType.pm_engineer,
          isPrimary: true,
          userId: { not: payload.data.mainEngineerId },
        },
      });
      await tx.projectMemberAssignment.createMany({
        data: [
          {
            projectId: params.id,
            userId: payload.data.projectManagerId,
            role: ProjectRoleType.pm_construction_manager,
            isPrimary: true,
            assignedBy: user.id,
          },
          {
            projectId: params.id,
            userId: payload.data.mainEngineerId,
            role: ProjectRoleType.pm_engineer,
            isPrimary: true,
            assignedBy: user.id,
          },
        ],
        skipDuplicates: true,
      });

      const { diff, lines } = buildDiff(
        { projectManagerId: prevPm?.fullName ?? project.projectManagerId, mainEngineerId: prevEng?.fullName ?? project.mainEngineerId },
        { projectManagerId: nextPm?.fullName ?? payload.data.projectManagerId, mainEngineerId: nextEng?.fullName ?? payload.data.mainEngineerId },
        [
          { key: "projectManagerId", label: "GĐ Thi Công" },
          { key: "mainEngineerId", label: "KS chính" },
        ],
      );
      if (Object.keys(diff).length > 0) {
        await logProjectActivity(tx, {
          projectId: params.id,
          actorId: user.id,
          entity: "project",
          entityId: params.id,
          action: "update",
          summary: joinSummary("Đổi phân công dự án", lines, "Cập nhật phân công"),
          diff,
          metadata: { section: "assignment", projectManagerId: payload.data.projectManagerId, mainEngineerId: payload.data.mainEngineerId },
        });
      }

      return result;
    });

    return NextResponse.json({ project: updated, message: "Đã cập nhật phân công" });
  }

  if (parsed.data.section === "members") {
    if (!isAdmin) {
      return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
    }

    const payload = membersSyncSchema.safeParse(parsed.data.payload);
    if (!payload.success) {
      return NextResponse.json({ message: payload.error.issues[0]?.message || "Dữ liệu thành viên không hợp lệ" }, { status: 400 });
    }

    const uniqueIds = new Set(payload.data.rows.map((r) => r.userId));
    if (uniqueIds.size !== payload.data.rows.length) {
      return NextResponse.json({ message: "Có user bị chọn trùng trong danh sách thành viên" }, { status: 400 });
    }

    const project = await prisma.project.findUnique({
      where: { id: params.id },
      select: { id: true, projectManagerId: true, mainEngineerId: true },
    });
    if (!project) return NextResponse.json({ message: "Không tìm thấy dự án" }, { status: 404 });

    const rows = payload.data.rows.filter(
      (r) => r.userId !== project.projectManagerId && r.userId !== project.mainEngineerId,
    );

    if (rows.length > 0) {
      const validUsers = await prisma.user.findMany({
        where: { id: { in: rows.map((r) => r.userId) }, isActive: true },
        select: { id: true },
      });
      if (validUsers.length !== rows.length) {
        return NextResponse.json({ message: "Có user thành viên không hợp lệ" }, { status: 400 });
      }
    }

    const beforeMembers = await prisma.projectMember.findMany({
      where: { projectId: params.id, userId: { notIn: [project.projectManagerId, project.mainEngineerId] } },
      include: { user: { select: { id: true, fullName: true } } },
    });

    await prisma.$transaction(async (tx) => {
      await tx.projectMember.deleteMany({
        where: {
          projectId: params.id,
          userId: { notIn: [project.projectManagerId, project.mainEngineerId] },
        },
      });
      if (rows.length > 0) {
        await tx.projectMember.createMany({
          data: rows.map((r) => ({
            projectId: params.id,
            userId: r.userId,
            roleInProject: r.roleInProject,
            addedBy: user.id,
          })),
          skipDuplicates: true,
        });
      }

      const beforeIds = new Set(beforeMembers.map((m) => m.userId));
      const afterIds = new Set(rows.map((r) => r.userId));
      const added = rows.filter((r) => !beforeIds.has(r.userId));
      const removed = beforeMembers.filter((m) => !afterIds.has(m.userId));

      if (added.length > 0 || removed.length > 0) {
        const addedUsers = added.length > 0 ? await tx.user.findMany({ where: { id: { in: added.map((r) => r.userId) } }, select: { id: true, fullName: true } }) : [];
        const addedNames = addedUsers.map((u) => u.fullName).join(", ");
        const removedNames = removed.map((m) => m.user.fullName).join(", ");
        const parts: string[] = [];
        if (added.length > 0) parts.push(`Thêm: ${addedNames}`);
        if (removed.length > 0) parts.push(`Bỏ: ${removedNames}`);
        await logProjectActivity(tx, {
          projectId: params.id,
          actorId: user.id,
          entity: "project_member",
          action: "update",
          summary: `Đổi thành viên dự án — ${parts.join("; ")}`,
          metadata: { added: addedUsers.map((u) => u.id), removed: removed.map((m) => m.userId) },
        });
      }
    });

    return NextResponse.json({ message: "Đã cập nhật thành viên" });
  }

  if (parsed.data.section === "reporting") {
    if (!isAdmin) {
      return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
    }

    const payload = reportingSchema.safeParse(parsed.data.payload);
    if (!payload.success) {
      return NextResponse.json({ message: payload.error.issues[0]?.message || "Dữ liệu cấu hình báo cáo không hợp lệ" }, { status: 400 });
    }

    const beforeGoLive = project.goLiveDate;
    const updated = await prisma.project.update({
      where: { id: params.id },
      data: {
        goLiveDate: normalizeNullableDate(payload.data.goLiveDate),
      },
    });

    if ((beforeGoLive?.getTime() ?? null) !== (updated.goLiveDate?.getTime() ?? null)) {
      await logProjectActivity(prisma, {
        projectId: project.id,
        actorId: user.id,
        entity: "project",
        entityId: project.id,
        action: "update",
        summary: `Đổi ngày go-live: ${fmtDate(beforeGoLive)} → ${fmtDate(updated.goLiveDate)}`,
        diff: { goLiveDate: { from: beforeGoLive, to: updated.goLiveDate } },
        metadata: { section: "reporting" },
      });
    }

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

    const actions: string[] = [];
    if (payload.data.customerPortalPassword !== undefined) actions.push("Đổi mật khẩu cổng chủ nhà");
    if (payload.data.customerPortalEnabled !== undefined && payload.data.customerPortalEnabled !== project.customerPortalEnabled) {
      actions.push(payload.data.customerPortalEnabled ? "Bật cổng chủ nhà" : "Tắt cổng chủ nhà");
    }
    if ((parsed.data.payload as { resetToken?: boolean }).resetToken) actions.push("Đổi link truy cập (reset token)");
    if (actions.length > 0) {
      await logProjectActivity(prisma, {
        projectId: project.id,
        actorId: user.id,
        entity: "customer_portal",
        entityId: project.id,
        action: "update",
        summary: actions.join("; "),
        metadata: { section: "customer_portal" },
      });
    }

    return NextResponse.json({ project: updated, message: "Đã cập nhật cổng chủ nhà" });
  }

  const payload = projectSchema.safeParse(parsed.data.payload);
  if (!payload.success) {
    return NextResponse.json({ message: payload.error.issues[0]?.message || "Dữ liệu dự án không hợp lệ" }, { status: 400 });
  }

  if (!isAdmin && !isConstructionManager) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const startDate = normalizeDate(payload.data.startDate);
  const previousStartDate = new Date(project.startDate);
  previousStartDate.setHours(0, 0, 0, 0);
  const isStartDateChanged = previousStartDate.getTime() !== startDate.getTime();

  const contractValue = Math.round(payload.data.contractValue);
  const expectedEndDate = normalizeDate(payload.data.expectedEndDate);

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.project.update({
      where: { id: params.id },
      data: {
        name: payload.data.name,
        contractValue,
        startDate,
        expectedEndDate,
        ...(payload.data.plannedDeadline !== undefined ? { plannedDeadline: normalizeNullableDate(payload.data.plannedDeadline) } : {}),
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
        if (payment.dayOffset == null) continue;
        const newExpected = addDays(startDate, payment.dayOffset);
        await tx.paymentSchedule.update({
          where: { id: payment.id },
          data: {
            expectedDate: newExpected,
            dueDate: newExpected,
          },
        });
      }
    }

    const { diff, lines } = buildDiff(
      {
        name: project.name,
        contractValue: project.contractValue ? Number(project.contractValue) : null,
        startDate: project.startDate,
        expectedEndDate: project.expectedEndDate,
        plannedDeadline: project.plannedDeadline,
        actualEndDate: project.actualEndDate,
        status: project.status,
        notes: project.notes ?? null,
      },
      {
        name: updated.name,
        contractValue: updated.contractValue ? Number(updated.contractValue) : null,
        startDate: updated.startDate,
        expectedEndDate: updated.expectedEndDate,
        plannedDeadline: updated.plannedDeadline,
        actualEndDate: updated.actualEndDate,
        status: updated.status,
        notes: updated.notes ?? null,
      },
      [
        { key: "name", label: "Tên dự án" },
        { key: "contractValue", label: "Giá HĐ", format: fmtMoney },
        { key: "startDate", label: "Ngày khởi công", format: fmtDate },
        { key: "expectedEndDate", label: "Ngày bàn giao DK", format: fmtDate },
        { key: "plannedDeadline", label: "Hạn nội bộ", format: fmtDate },
        { key: "actualEndDate", label: "Ngày bàn giao thực tế", format: fmtDate },
        { key: "status", label: "Trạng thái" },
        { key: "notes", label: "Ghi chú" },
      ],
    );
    if (Object.keys(diff).length > 0) {
      await logProjectActivity(tx, {
        projectId: params.id,
        actorId: user.id,
        entity: "project",
        entityId: params.id,
        action: "update",
        summary: joinSummary("Sửa dự án", lines, "Cập nhật dự án"),
        diff,
        metadata: { section: "project", taskDatesShifted: isStartDateChanged },
      });
    }

    return updated;
  });

  return NextResponse.json({
    project: result,
    message: isStartDateChanged
      ? "Đã cập nhật dự án. Ngày dự kiến của công tác và các đợt thanh toán đã được dịch theo ngày khởi công mới."
      : "Đã cập nhật dự án",
  });
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }

  if (user.role !== UserRole.admin) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const project = await prisma.project.findUnique({
    where: { id: params.id },
  });

  if (!project) {
    return NextResponse.json({ message: "Không tìm thấy dự án" }, { status: 404 });
  }

  // Log delete event with full snapshot. Note: log row itself cascades on
  // project delete, but the console line below preserves the event server-side.
  console.log(`[project-delete] actor=${user.id} project=${project.id} code=${project.code} name="${project.name}"`);

  await prisma.project.delete({ where: { id: params.id } });

  return NextResponse.json({ message: `Đã xóa dự án ${project.name}` });
}
