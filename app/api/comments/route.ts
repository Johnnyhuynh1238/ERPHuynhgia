import { CommentTargetType, UserRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-helpers";
import { getClientIpFromHeaders } from "@/lib/customer-portal";
import { validateCustomerCommentTarget } from "@/lib/customer-portal-v2";
import { prisma } from "@/lib/prisma";
import { buildProjectAccessWhere } from "@/lib/project-permissions";

const commentSchema = z.object({
  projectId: z.string().uuid(),
  targetType: z.nativeEnum(CommentTargetType),
  targetId: z.string().uuid(),
  parentId: z.string().uuid().nullable().optional(),
  content: z.string().trim().min(1, "Nội dung là bắt buộc"),
});

function canComment(role: UserRole) {
  return role === UserRole.admin || role === UserRole.accountant || role === UserRole.construction_manager || role === UserRole.engineer;
}

function parseTargetType(value: string | null) {
  return value && Object.values(CommentTargetType).includes(value as CommentTargetType) ? (value as CommentTargetType) : null;
}

async function requireStaffProjectAccess(projectId: string) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return { error: NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 }) };
  if (!canComment(user.role as UserRole)) return { error: NextResponse.json({ message: "Không có quyền" }, { status: 403 }) };

  const project = await prisma.project.findFirst({
    where: { id: projectId, ...buildProjectAccessWhere({ id: user.id, role: user.role }) },
    select: { id: true },
  });
  if (!project) return { error: NextResponse.json({ message: "Không có quyền hoặc dự án không tồn tại" }, { status: 403 }) };

  const staff = await prisma.user.findUnique({ where: { id: user.id }, select: { id: true, fullName: true } });
  return { user, staff, project };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const projectId = url.searchParams.get("projectId") || "";
  const targetType = parseTargetType(url.searchParams.get("targetType"));
  const targetId = url.searchParams.get("targetId") || "";

  if (!projectId) return NextResponse.json({ message: "Thiếu dự án" }, { status: 400 });
  const access = await requireStaffProjectAccess(projectId);
  if (access.error) return access.error;

  const comments = await prisma.customerComment.findMany({
    where: {
      projectId,
      parentId: null,
      ...(targetType ? { targetType } : {}),
      ...(targetId ? { targetId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      author: { select: { id: true, fullName: true, email: true } },
      task: { select: { id: true, code: true, name: true } },
      eveningReport: { select: { id: true, reportDate: true } },
      replies: {
        include: { author: { select: { id: true, fullName: true, email: true } } },
        orderBy: { createdAt: "asc" },
      },
      threadReplies: {
        include: { author: { select: { id: true, fullName: true, email: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  return NextResponse.json({ comments });
}

export async function POST(request: Request) {
  const parsed = commentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" }, { status: 400 });

  const access = await requireStaffProjectAccess(parsed.data.projectId);
  if (access.error) return access.error;

  const target = await validateCustomerCommentTarget(prisma, parsed.data.projectId, parsed.data.targetType, parsed.data.targetId);
  if (!target.ok) return NextResponse.json({ message: target.message }, { status: 400 });

  const parentId = parsed.data.parentId || null;
  if (parentId) {
    const parent = await prisma.customerComment.findFirst({
      where: { id: parentId, projectId: parsed.data.projectId, targetType: parsed.data.targetType, targetId: parsed.data.targetId },
      select: { id: true },
    });
    if (!parent) return NextResponse.json({ message: "Bình luận cha không hợp lệ" }, { status: 400 });
  }

  const comment = await prisma.customerComment.create({
    data: {
      projectId: parsed.data.projectId,
      taskId: target.taskId,
      eveningReportId: target.eveningReportId,
      targetType: parsed.data.targetType,
      targetId: parsed.data.targetId,
      parentId,
      authorType: "staff",
      authorId: access.user.id,
      authorName: access.staff?.fullName || "Nhân sự",
      content: parsed.data.content,
      ipAddress: getClientIpFromHeaders(request.headers),
      userAgent: request.headers.get("user-agent") || "",
      readByStaff: true,
    },
    include: { author: { select: { id: true, fullName: true, email: true } } },
  });

  return NextResponse.json({ comment, message: "Đã gửi bình luận" });
}
