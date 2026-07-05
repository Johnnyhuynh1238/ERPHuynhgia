import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { buildProjectAccessWhere } from "@/lib/project-permissions";

export const dynamic = "force-dynamic";

// KSQL/TPTC chỉ xem + tải biên bản; tạo/sửa/xoá mốc là việc của admin.
const MANAGE_ROLES = new Set<string>([UserRole.admin]);

async function findMilestone(userId: string, role: string, projectId: string, milestoneId: string) {
  return prisma.acceptanceMilestone.findFirst({
    where: {
      id: milestoneId,
      projectId,
      project: buildProjectAccessWhere({ id: userId, role }),
    },
  });
}

const updateSchema = z.object({
  seq: z.number().int().min(1).max(999).optional(),
  title: z.string().trim().min(3, "Tên mốc quá ngắn").max(300).optional(),
  description: z.string().trim().max(3000).nullable().optional(),
});

export async function PATCH(request: Request, { params }: { params: { id: string; milestoneId: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (!MANAGE_ROLES.has(user.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const current = await findMilestone(user.id, user.role, params.id, params.milestoneId);
  if (!current) return NextResponse.json({ message: "Không tìm thấy mốc nghiệm thu" }, { status: 404 });
  if (current.status === "signed") {
    return NextResponse.json({ message: "Mốc đã được chủ nhà ký — không sửa được nữa" }, { status: 409 });
  }

  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const milestone = await prisma.acceptanceMilestone.update({
    where: { id: current.id },
    data: {
      ...(parsed.data.seq != null ? { seq: parsed.data.seq } : {}),
      ...(parsed.data.title != null ? { title: parsed.data.title } : {}),
      ...(parsed.data.description !== undefined ? { description: parsed.data.description || null } : {}),
    },
  });

  return NextResponse.json({ milestone, message: "Đã cập nhật mốc nghiệm thu" });
}

export async function DELETE(_req: Request, { params }: { params: { id: string; milestoneId: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (!MANAGE_ROLES.has(user.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const current = await findMilestone(user.id, user.role, params.id, params.milestoneId);
  if (!current) return NextResponse.json({ message: "Không tìm thấy mốc nghiệm thu" }, { status: 404 });
  if (current.status === "signed") {
    return NextResponse.json({ message: "Mốc đã được chủ nhà ký — không xoá được" }, { status: 409 });
  }

  await prisma.acceptanceMilestone.delete({ where: { id: current.id } });
  return NextResponse.json({ message: `Đã xoá mốc #${current.seq} — ${current.title}` });
}
