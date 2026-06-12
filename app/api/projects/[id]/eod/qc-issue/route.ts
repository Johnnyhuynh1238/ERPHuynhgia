import { NextResponse } from "next/server";
import { WorkerQcIssueSeverity } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { buildProjectAccessWhere } from "@/lib/project-permissions";
import { canCreateWorkerQcIssue } from "@/lib/qc-mapping";
import { logProjectActivity } from "@/lib/project-activity-log";

const bodySchema = z.object({
  outputId: z.string().uuid().nullable().optional(),
  workerIds: z.array(z.string().uuid()).min(1).max(20),
  severity: z.nativeEnum(WorkerQcIssueSeverity),
  reason: z.string().trim().min(1).max(300),
  occurredAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (!canCreateWorkerQcIssue({ id: user.id, role: user.role })) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const project = await prisma.project.findFirst({
    where: { id: params.id, ...buildProjectAccessWhere({ id: user.id, role: user.role }) },
    select: { id: true },
  });
  if (!project) return NextResponse.json({ message: "Không có quyền hoặc dự án không tồn tại" }, { status: 403 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }
  const { outputId, workerIds, severity, reason, occurredAt } = parsed.data;

  // Validate workers thuộc project
  const validWorkers = await prisma.worker.count({
    where: { id: { in: workerIds }, projectId: params.id },
  });
  if (validWorkers !== workerIds.length) {
    return NextResponse.json({ message: "Có thợ không thuộc công trình" }, { status: 400 });
  }

  if (outputId) {
    const out = await prisma.workOrderOutput.findFirst({
      where: { id: outputId, projectId: params.id },
      select: { id: true },
    });
    if (!out) return NextResponse.json({ message: "Sản lượng không thuộc dự án" }, { status: 400 });
  }

  const occurred = new Date(`${occurredAt}T00:00:00.000Z`);

  const created = await prisma.workerQcIssue.createMany({
    data: workerIds.map((workerId) => ({
      workerId,
      outputId: outputId ?? null,
      projectId: params.id,
      severity,
      reason,
      occurredAt: occurred,
      createdById: user.id,
    })),
  });

  await logProjectActivity(prisma, {
    projectId: params.id,
    actorId: user.id,
    entity: "worker_qc_issue",
    action: "create",
    summary: `Ghi lỗi QC ${severity} cho ${workerIds.length} thợ: "${reason}"`,
    metadata: { workerCount: workerIds.length, severity, outputId: outputId ?? null },
  });

  return NextResponse.json({ ok: true, created: created.count });
}
