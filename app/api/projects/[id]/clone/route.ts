import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";

const cloneSchema = z.object({
  newProject: z.object({
    code: z.string().trim().min(3),
    name: z.string().trim().min(3),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    expectedEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    goLiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  }),
  copy: z.object({
    projectInfo: z.boolean().optional().default(true),
    phasesTasks: z.boolean().optional().default(true),
    technicalQc: z.boolean().optional().default(true),
    assignments: z.boolean().optional().default(true),
  }),
});

function toDateOnlyUtc(raw: string) {
  const [y, m, d] = raw.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }
  if (user.role !== UserRole.admin) {
    return NextResponse.json({ message: "Chỉ admin được sao chép dự án" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = cloneSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const sourceProject = await prisma.project.findUnique({
    where: { id: params.id },
  });
  if (!sourceProject) {
    return NextResponse.json({ message: "Không tìm thấy dự án nguồn" }, { status: 404 });
  }

  const existed = await prisma.project.findUnique({ where: { code: parsed.data.newProject.code } });
  if (existed) {
    return NextResponse.json({ message: "Mã dự án mới đã tồn tại" }, { status: 400 });
  }

  const copy = parsed.data.copy;
  const startDate = parsed.data.newProject.startDate
    ? toDateOnlyUtc(parsed.data.newProject.startDate)
    : new Date(sourceProject.startDate);
  const expectedEndDate = parsed.data.newProject.expectedEndDate
    ? toDateOnlyUtc(parsed.data.newProject.expectedEndDate)
    : new Date(sourceProject.expectedEndDate);

  const created = await prisma.$transaction(async (tx) => {
    const fallbackManagerId = sourceProject.projectManagerId || user.id;
    const fallbackEngineerId = sourceProject.mainEngineerId || user.id;

    const project = await tx.project.create({
      data: {
        code: parsed.data.newProject.code,
        name: parsed.data.newProject.name,
        customerName: copy.projectInfo ? sourceProject.customerName || "Khách hàng" : "Khách hàng",
        customerPhone: copy.projectInfo ? sourceProject.customerPhone || "N/A" : "N/A",
        customerIdNumber: copy.projectInfo ? sourceProject.customerIdNumber : null,
        address: copy.projectInfo ? sourceProject.address || "Chưa cập nhật" : "Chưa cập nhật",
        areaM2: copy.projectInfo ? sourceProject.areaM2 ?? 0 : 0,
        unitPrice: copy.projectInfo ? sourceProject.unitPrice ?? 0 : 0,
        contractValue: copy.projectInfo ? sourceProject.contractValue : null,
        startDate,
        expectedEndDate,
        actualEndDate: null,
        goLiveDate: parsed.data.newProject.goLiveDate ? toDateOnlyUtc(parsed.data.newProject.goLiveDate) : null,
        customerPortalEnabled: sourceProject.customerPortalEnabled ?? true,
        customerPortalToken: null,
        customerPortalPassword: null,
        projectManagerId: fallbackManagerId,
        mainEngineerId: fallbackEngineerId,
        status: "planning",
        notes: copy.projectInfo ? sourceProject.notes : null,
      },
    });

    if (copy.assignments) {
      const sourceAssignments = await tx.projectMemberAssignment.findMany({
        where: { projectId: sourceProject.id },
      });
      if (sourceAssignments.length > 0) {
        await tx.projectMemberAssignment.createMany({
          data: sourceAssignments.map((row) => ({
            projectId: project.id,
            userId: row.userId,
            role: row.role,
            isPrimary: row.isPrimary,
            assignedBy: user.id,
          })),
          skipDuplicates: true,
        });
      }
    }

    if (copy.phasesTasks) {
      const sourceTasks = await tx.task.findMany({
        where: { projectId: sourceProject.id },
        include: {
          qcItems: { orderBy: { orderIndex: "asc" } },
          materialItems: { orderBy: { orderIndex: "asc" } },
        },
        orderBy: [{ displayOrder: "asc" }, { code: "asc" }],
      });

      for (const task of sourceTasks) {
        const createdTask = await tx.task.create({
          data: {
            projectId: project.id,
            templateId: task.templateId,
            code: task.code,
            phase: task.phase,
            name: task.name,
            offsetDays: task.offsetDays,
            durationDays: task.durationDays,
            plannedStartDate: task.plannedStartDate,
            plannedEndDate: task.plannedEndDate,
            actualStartDate: null,
            actualEndDate: null,
            assignedEngineerId: task.assignedEngineerId,
            assignedForemanId: task.assignedForemanId,
            team: task.team,
            inspectorName: task.inspectorName,
            materialsNeeded: task.materialsNeeded,
            proposerRole: task.proposerRole,
            ordererRole: task.ordererRole,
            receiverRole: task.receiverRole,
            qcChecklist: task.qcChecklist,
            isMilestone: task.isMilestone,
            visibleToCustomer: task.visibleToCustomer,
            status: "not_started",
            isActive: task.isActive,
            displayOrder: task.displayOrder,
            notes: task.notes,
            technicalRequirements: copy.technicalQc ? task.technicalRequirements : null,
            constructionMethod: copy.technicalQc ? task.constructionMethod : null,
          },
        });

        if (copy.technicalQc && task.qcItems.length > 0) {
          await tx.qcItem.createMany({
            data: task.qcItems.map((item) => ({
              taskId: createdTask.id,
              templateItemId: item.templateItemId,
              content: item.content,
              requirePhoto: item.requirePhoto,
              requireNote: item.requireNote,
              createdBy: user.id,
              orderIndex: item.orderIndex,
            })),
          });
        }

        if (task.materialItems.length > 0) {
          await tx.taskMaterialItem.createMany({
            data: task.materialItems.map((item) => ({
              taskId: createdTask.id,
              name: item.name,
              isAvailable: false,
              orderIndex: item.orderIndex,
            })),
          });
        }
      }
    }

    return project;
  });

  return NextResponse.json({
    message: "Đã sao chép dự án thành công",
    project: { id: created.id, code: created.code, name: created.name },
  });
}
