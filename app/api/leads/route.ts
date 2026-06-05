import { NextResponse } from "next/server";
import { BaogiaLeadStatus, Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

const VALID_STATUSES = new Set<BaogiaLeadStatus>(["new", "contacted", "signed", "spam"]);

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user?.id) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const url = new URL(request.url);
  const statusParam = url.searchParams.get("status");
  const search = url.searchParams.get("q")?.trim();
  const cursor = url.searchParams.get("cursor");
  const take = Math.min(Math.max(Number(url.searchParams.get("take") || 30), 1), 100);

  const where: Prisma.BaogiaLeadWhereInput = {};
  if (statusParam && VALID_STATUSES.has(statusParam as BaogiaLeadStatus)) {
    where.status = statusParam as BaogiaLeadStatus;
  }
  if (search) {
    where.OR = [{ name: { contains: search, mode: "insensitive" } }, { phone: { contains: search } }];
  }

  const items = await prisma.baogiaLead.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      name: true,
      phone: true,
      feeTotal: true,
      status: true,
      createdAt: true,
      contactedAt: true,
    },
  });

  const hasMore = items.length > take;
  const data = hasMore ? items.slice(0, take) : items;
  const nextCursor = hasMore ? data[data.length - 1].id : null;

  const counts = await prisma.baogiaLead.groupBy({ by: ["status"], _count: { _all: true } });
  const countMap = Object.fromEntries(counts.map((c) => [c.status, c._count._all]));

  return NextResponse.json({ items: data, nextCursor, counts: countMap });
}
