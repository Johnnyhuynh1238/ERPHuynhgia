import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { deleteObjectFromMinio } from "@/lib/minio";
import { prisma } from "@/lib/prisma";
import { buildProjectAccessWhere } from "@/lib/project-permissions";
import { buildDiff, joinSummary, logProjectActivity } from "@/lib/project-activity-log";

function minioKey(url: string) {
  return url.startsWith("minio://") ? url.slice("minio://".length) : null;
}

async function requireAdminDrawingAccess(id: string) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return { error: NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 }) };
  if (user.role !== UserRole.admin) return { error: NextResponse.json({ message: "Chỉ admin được chỉnh bản vẽ" }, { status: 403 }) };

  const drawing = await prisma.projectDrawing.findUnique({ where: { id }, select: { id: true, projectId: true, fileUrl: true, name: true, description: true, displayOrder: true } });
  if (!drawing) return { error: NextResponse.json({ message: "Không tìm thấy bản vẽ" }, { status: 404 }) };

  const project = await prisma.project.findFirst({
    where: { id: drawing.projectId, ...buildProjectAccessWhere({ id: user.id, role: user.role }) },
    select: { id: true },
  });
  if (!project) return { error: NextResponse.json({ message: "Không có quyền" }, { status: 403 }) };

  return { user, drawing };
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const access = await requireAdminDrawingAccess(params.id);
  if (access.error) return access.error;

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : undefined;
  const description = typeof body?.description === "string" ? body.description.trim() : undefined;
  const displayOrder = body?.displayOrder == null ? undefined : Number(body.displayOrder);

  if (name !== undefined && name.length === 0) return NextResponse.json({ message: "Tên bản vẽ là bắt buộc" }, { status: 400 });

  const drawing = await prisma.projectDrawing.update({
    where: { id: params.id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(description !== undefined ? { description: description || null } : {}),
      ...(displayOrder !== undefined && Number.isFinite(displayOrder) ? { displayOrder } : {}),
    },
  });

  const { diff, lines } = buildDiff(
    { name: access.drawing.name, description: access.drawing.description, displayOrder: access.drawing.displayOrder },
    { name: drawing.name, description: drawing.description, displayOrder: drawing.displayOrder },
    [
      { key: "name", label: "Tên" },
      { key: "description", label: "Mô tả" },
      { key: "displayOrder", label: "Thứ tự" },
    ],
  );

  if (Object.keys(diff).length > 0) {
    await logProjectActivity(prisma, {
      projectId: access.drawing.projectId,
      actorId: access.user.id,
      entity: "project_drawing",
      entityId: drawing.id,
      action: "update",
      summary: joinSummary(`Sửa bản vẽ "${drawing.name}"`, lines, `Cập nhật bản vẽ "${drawing.name}"`),
      diff,
    });
  }

  return NextResponse.json({ drawing, message: "Đã cập nhật bản vẽ" });
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const access = await requireAdminDrawingAccess(params.id);
  if (access.error) return access.error;

  await prisma.projectDrawing.delete({ where: { id: params.id } });
  const key = minioKey(access.drawing.fileUrl);
  if (key) await deleteObjectFromMinio(key).catch(() => null);

  await logProjectActivity(prisma, {
    projectId: access.drawing.projectId,
    actorId: access.user.id,
    entity: "project_drawing",
    entityId: access.drawing.id,
    action: "delete",
    summary: `Xóa bản vẽ "${access.drawing.name}"`,
    snapshot: access.drawing,
  });

  return NextResponse.json({ message: "Đã xóa bản vẽ" });
}
