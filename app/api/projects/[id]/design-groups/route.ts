import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { buildDesignGroupVisibilityWhere } from "@/lib/design-photos";

export const runtime = "nodejs";

const createSchema = z.object({
  title: z.string().trim().min(1, "Tiêu đề bắt buộc").max(120),
  description: z.string().trim().max(500).optional().nullable(),
  visibleToCustomer: z.boolean().optional().default(false),
  viewerIds: z.array(z.string().uuid()).max(200).optional().default([]),
});

function authError(error: unknown) {
  const msg = error instanceof Error ? error.message : "UNKNOWN";
  if (msg === "401_UNAUTHORIZED") return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (msg === "403_FORBIDDEN") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  return NextResponse.json({ message: "Lỗi xác thực" }, { status: 500 });
}

function fileViewUrl(projectId: string, photoId: string, variant: "thumb" | "photo") {
  return `/api/projects/${projectId}/design-photos/${photoId}/file?variant=${variant}`;
}

function serializeGroup(projectId: string, group: {
  id: string;
  title: string;
  description: string | null;
  visibleToCustomer: boolean;
  displayOrder: number;
  createdAt: Date;
  updatedAt: Date;
  creator?: { id: string; fullName: string } | null;
  accessList?: Array<{ user: { id: string; fullName: string; role: string } }>;
  photos?: Array<{ id: string; caption: string | null; displayOrder: number; uploadedAt: Date }>;
  _count?: { photos: number };
}) {
  return {
    id: group.id,
    title: group.title,
    description: group.description,
    visibleToCustomer: group.visibleToCustomer,
    displayOrder: group.displayOrder,
    createdAt: group.createdAt.toISOString(),
    updatedAt: group.updatedAt.toISOString(),
    creator: group.creator || null,
    grantedUsers: group.accessList ? group.accessList.map((a) => a.user) : [],
    photos: (group.photos || []).map((photo) => ({
      id: photo.id,
      caption: photo.caption,
      displayOrder: photo.displayOrder,
      uploadedAt: photo.uploadedAt.toISOString(),
      photoUrl: fileViewUrl(projectId, photo.id, "photo"),
      thumbnailUrl: fileViewUrl(projectId, photo.id, "thumb"),
    })),
    photoCount: group._count?.photos ?? (group.photos?.length || 0),
  };
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  let current;
  try {
    current = await requireRole(["admin", "engineer", "foreman", "accountant", "construction_manager"]);
  } catch (error) {
    return authError(error);
  }

  const project = await prisma.project.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!project) return NextResponse.json({ message: "Không tìm thấy dự án" }, { status: 404 });

  const groups = await prisma.designPhotoGroup.findMany({
    where: {
      projectId: params.id,
      ...buildDesignGroupVisibilityWhere({ id: current.id, role: current.role }),
    },
    orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
    include: {
      creator: { select: { id: true, fullName: true } },
      accessList: { select: { user: { select: { id: true, fullName: true, role: true } } } },
      photos: {
        orderBy: [{ displayOrder: "asc" }, { uploadedAt: "asc" }],
        select: { id: true, caption: true, displayOrder: true, uploadedAt: true },
      },
    },
  });

  return NextResponse.json({ groups: groups.map((g) => serializeGroup(params.id, g)) });
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  let current;
  try {
    current = await requireRole(["admin"]);
  } catch (error) {
    return authError(error);
  }

  const project = await prisma.project.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!project) return NextResponse.json({ message: "Không tìm thấy dự án" }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const viewerIds = Array.from(new Set(parsed.data.viewerIds || []));
  if (viewerIds.length > 0) {
    const validUsers = await prisma.user.findMany({
      where: { id: { in: viewerIds }, isActive: true },
      select: { id: true },
    });
    if (validUsers.length !== viewerIds.length) {
      return NextResponse.json({ message: "Có nhân sự không tồn tại hoặc đã khóa" }, { status: 400 });
    }
  }

  const maxOrder = await prisma.designPhotoGroup.aggregate({
    where: { projectId: params.id },
    _max: { displayOrder: true },
  });

  const group = await prisma.$transaction(async (tx) => {
    const created = await tx.designPhotoGroup.create({
      data: {
        projectId: params.id,
        title: parsed.data.title,
        description: parsed.data.description || null,
        visibleToCustomer: parsed.data.visibleToCustomer || false,
        displayOrder: (maxOrder._max.displayOrder ?? -1) + 1,
        createdBy: current.id,
      },
    });
    if (viewerIds.length > 0) {
      await tx.designPhotoGroupAccess.createMany({
        data: viewerIds.map((userId) => ({ groupId: created.id, userId, grantedBy: current.id })),
      });
    }
    return tx.designPhotoGroup.findUnique({
      where: { id: created.id },
      include: {
        creator: { select: { id: true, fullName: true } },
        accessList: { select: { user: { select: { id: true, fullName: true, role: true } } } },
        photos: { select: { id: true, caption: true, displayOrder: true, uploadedAt: true } },
      },
    });
  });

  if (!group) return NextResponse.json({ message: "Tạo nhóm thất bại" }, { status: 500 });

  return NextResponse.json({ group: serializeGroup(params.id, group), message: "Đã tạo nhóm ảnh thiết kế" });
}
