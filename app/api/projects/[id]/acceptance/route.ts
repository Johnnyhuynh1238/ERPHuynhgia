import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { buildProjectAccessWhere } from "@/lib/project-permissions";

export const dynamic = "force-dynamic";

// Tạo/sửa/xoá mốc là việc của admin; KS/TPTC tải ảnh BB giấy + ảnh công trình (route photos).
const MANAGE_ROLES = new Set<string>([UserRole.admin]);

async function findAccessibleProject(userId: string, role: string, projectId: string) {
  return prisma.project.findFirst({
    where: { id: projectId, ...buildProjectAccessWhere({ id: userId, role }) },
    select: { id: true },
  });
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });

  const project = await findAccessibleProject(user.id, user.role, params.id);
  if (!project) return NextResponse.json({ message: "Không tìm thấy dự án" }, { status: 404 });

  const kind = new URL(req.url).searchParams.get("kind") === "thau_phu" ? "thau_phu" : "chu_nha";
  const milestones = await prisma.acceptanceMilestone.findMany({
    where: { projectId: params.id, kind },
    orderBy: [{ seq: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      seq: true,
      title: true,
      description: true,
      status: true,
      signerName: true,
      signedAt: true,
      customerNote: true,
      signatureUrl: true,
      bienBanPhotos: true,
      sitePhotos: true,
      templateFiles: true,
      createdAt: true,
      creator: { select: { fullName: true } },
    },
  });

  // Không gửi data-URL chữ ký (nặng) — chỉ cờ có chữ ký cổng CN cũ.
  return NextResponse.json({
    milestones: milestones.map(({ signatureUrl, ...m }) => ({ ...m, hasSignature: !!signatureUrl })),
  });
}

const createSchema = z.object({
  seq: z.number().int().min(1).max(999),
  title: z.string().trim().min(3, "Tên mốc quá ngắn").max(300),
  description: z.string().trim().max(3000).optional(),
  kind: z.enum(["chu_nha", "thau_phu"]).optional(),
});

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (!MANAGE_ROLES.has(user.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const project = await findAccessibleProject(user.id, user.role, params.id);
  if (!project) return NextResponse.json({ message: "Không tìm thấy dự án" }, { status: 404 });

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const milestone = await prisma.acceptanceMilestone.create({
    data: {
      projectId: params.id,
      seq: parsed.data.seq,
      title: parsed.data.title,
      description: parsed.data.description || null,
      kind: parsed.data.kind ?? "chu_nha",
      createdBy: user.id,
    },
  });

  return NextResponse.json({ milestone, message: `Đã tạo mốc nghiệm thu #${milestone.seq}` });
}
