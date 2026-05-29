import { NextResponse } from "next/server";
import { SiteRestReason, UserRole } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { parseYmdToUtcDate, toUtcStartOfDay } from "@/lib/date";
import { buildProjectAccessWhere } from "@/lib/project-permissions";
import { fmtDate, logProjectActivity } from "@/lib/project-activity-log";
import { fireAndForget, notifySiteRestDay } from "@/lib/notifications";

const createSchema = z.object({
  restDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.nativeEnum(SiteRestReason),
  note: z.string().trim().max(500).optional().nullable(),
});

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }

  const canManage = user.role === UserRole.admin || user.role === UserRole.construction_manager;
  if (!canManage) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const accessProject = await prisma.project.findFirst({
    where: {
      id: params.id,
      ...buildProjectAccessWhere({ id: user.id, role: user.role }),
    },
    select: { id: true },
  });

  if (!accessProject) {
    return NextResponse.json({ message: "Không có quyền hoặc dự án không tồn tại" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const restDate = toUtcStartOfDay(parseYmdToUtcDate(parsed.data.restDate));

  const existed = await prisma.siteRestDay.findUnique({
    where: {
      projectId_restDate: {
        projectId: params.id,
        restDate,
      },
    },
    select: { id: true },
  });

  if (existed) {
    return NextResponse.json({ message: "Ngày này đã được đánh dấu nghỉ" }, { status: 409 });
  }

  const row = await prisma.siteRestDay.create({
    data: {
      projectId: params.id,
      restDate,
      reason: parsed.data.reason,
      note: parsed.data.note || null,
      declaredBy: user.id,
    },
  });

  await logProjectActivity(prisma, {
    projectId: params.id,
    actorId: user.id,
    entity: "site_rest_day",
    entityId: row.id,
    action: "create",
    summary: `Đánh dấu nghỉ ngày ${fmtDate(restDate)} — ${parsed.data.reason}${parsed.data.note ? ` (${parsed.data.note})` : ""}`,
    metadata: { restDate: parsed.data.restDate, reason: parsed.data.reason, note: parsed.data.note || null },
  });

  fireAndForget(
    notifySiteRestDay({
      projectId: params.id,
      restDate,
      reason: parsed.data.reason,
      note: parsed.data.note,
      actorUserId: user.id,
      actorName: user.name ?? "TPTC",
      siteRestDayId: row.id,
    }),
  );

  return NextResponse.json({ siteRestDay: row, message: "Đã đánh dấu công trường nghỉ" });
}
