import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { ensureProjectDocGroups, groupFieldsSchema, toDocGroupDto } from "@/lib/project-doc-groups";
import { logProjectActivity } from "@/lib/project-activity-log";

export const runtime = "nodejs";

function authError(error: unknown) {
  const msg = error instanceof Error ? error.message : "UNKNOWN";
  if (msg === "401_UNAUTHORIZED") return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (msg === "403_FORBIDDEN") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  return NextResponse.json({ message: "Lỗi xác thực" }, { status: 500 });
}

const createSchema = groupFieldsSchema.extend({
  // true = lưu thêm thành nhóm mẫu → dự án mới tự có nhóm này
  asTemplate: z.boolean().optional(),
});

const reorderSchema = z.object({ order: z.array(z.string().uuid()).min(1).max(100) });

export async function POST(request: Request, { params }: { params: { id: string } }) {
  let current;
  try {
    current = await requireRole(["admin"]);
  } catch (error) {
    return authError(error);
  }
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }
  const project = await prisma.project.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!project) return NextResponse.json({ message: "Không tìm thấy dự án" }, { status: 404 });

  await ensureProjectDocGroups(params.id);
  const { asTemplate, ...fields } = parsed.data;
  const subfolders = Array.from(new Set(fields.subfolders));

  const group = await prisma.$transaction(async (tx) => {
    const last = await tx.projectDocGroup.aggregate({ where: { projectId: params.id }, _max: { displayOrder: true } });
    const created = await tx.projectDocGroup.create({
      data: { ...fields, subfolders, projectId: params.id, createdBy: current.id, displayOrder: (last._max.displayOrder ?? 0) + 1 },
    });
    if (asTemplate) {
      const lastTpl = await tx.projectDocGroup.aggregate({ where: { projectId: null }, _max: { displayOrder: true } });
      await tx.projectDocGroup.create({
        data: { ...fields, subfolders, projectId: null, createdBy: current.id, displayOrder: (lastTpl._max.displayOrder ?? 0) + 1 },
      });
    }
    return created;
  });

  await logProjectActivity(prisma, {
    projectId: params.id,
    actorId: current.id,
    entity: "project_doc_group",
    entityId: group.id,
    action: "create",
    summary: `Tạo nhóm hồ sơ "${group.name}"${asTemplate ? " (mặc định cho dự án mới)" : ""}`,
  });

  return NextResponse.json({ group: toDocGroupDto(group), message: "Đã tạo nhóm" });
}

// Đổi thứ tự nhóm (kéo thả ở cột trái).
export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireRole(["admin"]);
  } catch (error) {
    return authError(error);
  }
  const parsed = reorderSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });

  const owned = await prisma.projectDocGroup.findMany({
    where: { projectId: params.id, id: { in: parsed.data.order } },
    select: { id: true },
  });
  if (owned.length !== parsed.data.order.length) return NextResponse.json({ message: "Nhóm không hợp lệ" }, { status: 400 });

  await prisma.$transaction(
    parsed.data.order.map((id, i) => prisma.projectDocGroup.update({ where: { id }, data: { displayOrder: i + 1 } })),
  );
  return NextResponse.json({ message: "Đã đổi thứ tự" });
}
