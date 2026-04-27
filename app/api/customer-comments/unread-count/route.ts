import { NextResponse } from "next/server";
import { getCurrentUser, getStaffCommentUnreadCount } from "@/lib/auth-helpers";

export async function GET() {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }

  const count = await getStaffCommentUnreadCount(user.id, user.role);
  return NextResponse.json({ count });
}
