import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user?.id) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });

  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor");
  const onlyUnread = url.searchParams.get("unread") === "1";
  const take = Math.min(Math.max(Number(url.searchParams.get("take") || 20), 1), 100);

  const items = await prisma.staffNotification.findMany({
    where: {
      recipientId: user.id,
      ...(onlyUnread ? { isRead: false } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      kind: true,
      title: true,
      body: true,
      link: true,
      actorName: true,
      isRead: true,
      createdAt: true,
      projectId: true,
      refType: true,
      refId: true,
    },
  });

  const hasMore = items.length > take;
  const trimmed = hasMore ? items.slice(0, take) : items;
  const nextCursor = hasMore ? trimmed[trimmed.length - 1]?.id : null;

  return NextResponse.json({ items: trimmed, nextCursor });
}
