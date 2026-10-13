import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { buildProjectAccessWhere } from "@/lib/project-permissions";

export const dynamic = "force-dynamic";

// Tạo/sửa/xoá mốc là việc của admin; KS/TPTC tải ảnh BB giấy + ảnh công trình (route photos).
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
  if (current.signatureUrl) {
    return NextResponse.json({ message: "Mốc đã được chủ nhà ký trên cổng — không sửa được nữa" }, { status: 409 });
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
  if (current.signatureUrl) {
    return NextResponse.json({ message: "Mốc đã được chủ nhà ký trên cổng — không xoá được" }, { status: 409 });
  }
  const fileCount =
    (Array.isArray(current.bienBanPhotos) ? current.bienBanPhotos.length : 0) +
    (Array.isArray(current.sitePhotos) ? current.sitePhotos.length : 0);
  if (fileCount > 0) {
    return NextResponse.json({ message: `Mốc đang có ${fileCount} ảnh/biên bản — xoá ảnh trước rồi mới xoá mốc` }, { status: 409 });
  }

  await prisma.acceptanceMilestone.delete({ where: { id: current.id } });
  return NextResponse.json({ message: `Đã xoá mốc #${current.seq} — ${current.title}` });
}
