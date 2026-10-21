import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { fireAndForget } from "@/lib/notifications";
import { findTopicProject, notifyTopicCreated } from "@/lib/project-topics";

export const dynamic = "force-dynamic";

// Ô trao đổi nội bộ dự án: danh sách chủ đề (mới hoạt động lên đầu) + tạo chủ đề.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  const project = await findTopicProject(params.id, { id: user.id, role: user.role });
  if (!project) return NextResponse.json({ message: "forbidden" }, { status: 403 });

  const limit = Math.min(Math.max(Number(req.nextUrl.searchParams.get("limit")) || 50, 1), 200);
  const topics = await prisma.projectTopic.findMany({
    where: { projectId: project.id },
    orderBy: { lastActivityAt: "desc" },
    take: limit,
    select: {
      id: true,
      title: true,
      body: true,
      authorName: true,
      commentCount: true,
      lastActivityAt: true,
      createdAt: true,
    },
  });
  const total = await prisma.projectTopic.count({ where: { projectId: project.id } });
  return NextResponse.json({ topics, total });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  const project = await findTopicProject(params.id, { id: user.id, role: user.role });
  if (!project) return NextResponse.json({ message: "forbidden" }, { status: 403 });

  const raw = (await req.json().catch(() => null)) as { title?: unknown; body?: unknown } | null;
  const title = typeof raw?.title === "string" ? raw.title.trim() : "";
  const body = typeof raw?.body === "string" ? raw.body.trim() : "";
  if (!title) return NextResponse.json({ message: "Nhập tiêu đề chủ đề" }, { status: 400 });
  if (title.length > 200) return NextResponse.json({ message: "Tiêu đề tối đa 200 ký tự" }, { status: 400 });
  if (body.length > 5000) return NextResponse.json({ message: "Nội dung tối đa 5000 ký tự" }, { status: 400 });

  const me = await prisma.user.findUnique({ where: { id: user.id }, select: { fullName: true } });
  const topic = await prisma.projectTopic.create({
    data: {
      projectId: project.id,
      title,
      body: body || null,
      authorId: user.id,
      authorName: me?.fullName || user.name || "Thành viên",
    },
    select: { id: true },
  });

  fireAndForget(notifyTopicCreated(topic.id));
  return NextResponse.json({ id: topic.id }, { status: 201 });
}
