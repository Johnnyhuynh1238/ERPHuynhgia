import { NextResponse } from "next/server";
import { requireCustomerPortalApiAccess } from "@/lib/customer-portal-v2";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request, { params }: { params: { token: string } }) {
  const access = await requireCustomerPortalApiAccess(params.token);
  if (!access.ok) return NextResponse.json({ message: access.message }, { status: access.status });

  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor");
  const onlyUnread = url.searchParams.get("unread") === "1";
  const take = Math.min(Math.max(Number(url.searchParams.get("take") || 20), 1), 100);

  const items = await prisma.customerNotification.findMany({
    where: {
      projectId: access.project.id,
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
      refType: true,
      refId: true,
    },
  });

  const hasMore = items.length > take;
  const trimmed = hasMore ? items.slice(0, take) : items;
  const nextCursor = hasMore ? trimmed[trimmed.length - 1]?.id : null;

  // Prepend portal token to relative link
  const withTokenLink = trimmed.map((n) => ({
    ...n,
    link: n.link.startsWith("/") ? `/cn/${params.token}${n.link}` : n.link,
  }));

  return NextResponse.json({ items: withTokenLink, nextCursor });
}
