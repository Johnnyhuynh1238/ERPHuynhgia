import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = await getCurrentUser();
  if (!user?.id) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });

  const count = await prisma.staffNotification.count({
    where: { recipientId: user.id, isRead: false },
  });

  return NextResponse.json({ count });
}
