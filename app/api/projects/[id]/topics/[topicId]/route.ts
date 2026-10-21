import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { fireAndForget } from "@/lib/notifications";
import { findTopicProject, notifyTopicComment } from "@/lib/project-topics";

export const dynamic = "force-dynamic";

type Params = { params: { id: string; topicId: string } };

async function loadAccess(params: Params["params"]) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return { error: NextResponse.json({ message: "unauthorized" }, { status: 401 }) };
  const project = await findTopicProject(params.id, { id: user.id, role: user.role });
  if (!project) return { error: NextResponse.json({ message: "forbidden" }, { status: 403 }) };
  const topic = await prisma.projectTopic.findFirst({
    where: { id: params.topicId, projectId: project.id },
    select: { id: true },
  });
  if (!topic) return { error: NextResponse.json({ message: "Không tìm thấy chủ đề" }, { status: 404 }) };
  return { user, project, topic };
}

// Chi tiết chủ đề + toàn bộ bình luận (cũ → mới).
export async function GET(_req: NextRequest, { params }: Params) {
  const a = await loadAccess(params);
  if ("error" in a) return a.error;
  const topic = await prisma.projectTopic.findUnique({
    where: { id: a.topic.id },
    select: {
      id: true,
      title: true,
      body: true,
      authorId: true,
      authorName: true,
      commentCount: true,
      createdAt: true,
      comments: {
        orderBy: { createdAt: "asc" },
        select: { id: true, body: true, authorId: true, authorName: true, createdAt: true },
      },
    },
  });
  return NextResponse.json({ topic, meId: a.user.id });
}

// Thêm bình luận.
export async function POST(req: NextRequest, { params }: Params) {
  const a = await loadAccess(params);
  if ("error" in a) return a.error;

  const raw = (await req.json().catch(() => null)) as { body?: unknown } | null;
  const body = typeof raw?.body === "string" ? raw.body.trim() : "";
  if (!body) return NextResponse.json({ message: "Nhập nội dung bình luận" }, { status: 400 });
  if (body.length > 5000) return NextResponse.json({ message: "Bình luận tối đa 5000 ký tự" }, { status: 400 });

  const me = await prisma.user.findUnique({ where: { id: a.user.id }, select: { fullName: true } });
  const now = new Date();
  const [comment] = await prisma.$transaction([
    prisma.projectTopicComment.create({
      data: {
        topicId: a.topic.id,
        body,
        authorId: a.user.id,
        authorName: me?.fullName || a.user.name || "Thành viên",
        createdAt: now,
      },
      select: { id: true },
    }),
    prisma.projectTopic.update({
      where: { id: a.topic.id },
      data: { commentCount: { increment: 1 }, lastActivityAt: now },
    }),
  ]);

  fireAndForget(notifyTopicComment(comment.id));
  return NextResponse.json({ id: comment.id }, { status: 201 });
}
