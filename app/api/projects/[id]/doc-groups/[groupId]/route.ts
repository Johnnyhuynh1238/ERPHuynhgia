import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { CAD_EXTENSIONS, groupFieldsSchema, toDocGroupDto } from "@/lib/project-doc-groups";
import { logProjectActivity } from "@/lib/project-activity-log";

export const runtime = "nodejs";

function authError(error: unknown) {
  const msg = error instanceof Error ? error.message : "UNKNOWN";
  if (msg === "401_UNAUTHORIZED") return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (msg === "403_FORBIDDEN") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  return NextResponse.json({ message: "Lỗi xác thực" }, { status: 500 });
}

const patchSchema = groupFieldsSchema.partial();
const CAD_NAME_FILTER = Array.from(CAD_EXTENSIONS).map((ext) => ({ fileName: { endsWith: `.${ext}`, mode: "insensitive" as const } }));

export async function PATCH(request: Request, { params }: { params: { id: string; groupId: string } }) {
  let current;
  try {
    current = await requireRole(["admin"]);
  } catch (error) {
    return authError(error);
  }
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }
  const group = await prisma.projectDocGroup.findFirst({ where: { id: params.groupId, projectId: params.id } });
  if (!group) return NextResponse.json({ message: "Không tìm thấy nhóm" }, { status: 404 });

  const data = { ...parsed.data };
  if (data.subfolders) data.subfolders = Array.from(new Set(data.subfolders));

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.projectDocGroup.update({ where: { id: group.id }, data });
    // Đổi quyền chủ nhà của nhóm → đồng bộ cờ khách của file đang theo nhóm (bản hiện hành, không CAD, không phải file GĐ 4).
    if (data.permCustomer !== undefined && data.permCustomer !== group.permCustomer) {
      await tx.projectDocument.updateMany({
        where: { groupId: group.id, accessMode: "group", isCurrent: true, designStep: null, NOT: { OR: CAD_NAME_FILTER } },
        data: { visibleToCustomer: data.permCustomer },
      });
    }
    // Đổi tên / xoá mục con → file ở mục con bị bỏ về "chưa xếp".
    if (data.subfolders) {
      await tx.projectDocument.updateMany({
        where: { groupId: group.id, subfolder: { notIn: data.subfolders } },
        data: { subfolder: null },
      });
    }
    return row;
  });

  await logProjectActivity(prisma, {
    projectId: params.id,
    actorId: current.id,
    entity: "project_doc_group",
    entityId: group.id,
    action: "update",
    summary: `Sửa nhóm hồ sơ "${updated.name}"`,
    diff: Object.fromEntries(
      Object.keys(data).map((k) => [k, { from: (group as Record<string, unknown>)[k], to: (updated as Record<string, unknown>)[k] }]),
    ),
  });

  return NextResponse.json({ group: toDocGroupDto(updated), message: "Đã lưu nhóm" });
}

export async function DELETE(_request: Request, { params }: { params: { id: string; groupId: string } }) {
  let current;
  try {
    current = await requireRole(["admin"]);
  } catch (error) {
    return authError(error);
  }
  const group = await prisma.projectDocGroup.findFirst({
    where: { id: params.groupId, projectId: params.id },
    select: { id: true, name: true, systemKey: true, _count: { select: { documents: true } } },
  });
  if (!group) return NextResponse.json({ message: "Không tìm thấy nhóm" }, { status: 404 });
  if (group.systemKey) return NextResponse.json({ message: "Nhóm gốc không xoá được, chỉ đổi tên" }, { status: 400 });
  if (group._count.documents > 0) {
    return NextResponse.json({ message: `Nhóm còn ${group._count.documents} file — chuyển hoặc xoá file trước` }, { status: 400 });
  }
  await prisma.projectDocGroup.delete({ where: { id: group.id } });
  await logProjectActivity(prisma, {
    projectId: params.id,
    actorId: current.id,
    entity: "project_doc_group",
    entityId: group.id,
    action: "delete",
    summary: `Xoá nhóm hồ sơ "${group.name}"`,
  });
  return NextResponse.json({ message: "Đã xoá nhóm" });
}
