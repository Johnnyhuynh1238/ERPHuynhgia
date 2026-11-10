import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { buildProjectAccessWhere } from "@/lib/project-permissions";
import { tienDoGet, tienDoPatch } from "@/lib/tien-do";

export const runtime = "nodejs";

// Báo cáo tiến độ: admin + KS/QL được giao dự án. KS KHÔNG thấy tiền → ẩn số tiền.
const ALLOWED = new Set(["admin", "engineer", "construction_manager"]);

async function requireTienDo(projectId: string) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    return { user: null, error: NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 }) };
  }
  if (!ALLOWED.has(user.role)) {
    return { user: null, error: NextResponse.json({ message: "Không có quyền" }, { status: 403 }) };
  }
  const project = await prisma.project.findFirst({
    where: { id: projectId, ...buildProjectAccessWhere({ id: user.id, role: user.role }) },
    select: { id: true },
  });
  if (!project) return { user: null, error: NextResponse.json({ message: "Không thấy dự án" }, { status: 404 }) };
  return { user, error: null };
}

// GET: danh sách hạng mục + khối lượng con + tổng tiến độ (logic ở lib/tien-do.ts).
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireTienDo(params.id);
  if (error) return error;
  return tienDoGet(params.id, user!.role === "admin");
}

// PATCH: tick xong 1 khối lượng / cả hạng mục, 1 chiều (lib/tien-do.ts).
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireTienDo(params.id);
  if (error) return error;
  return tienDoPatch(req, params.id, user!.id);
}
