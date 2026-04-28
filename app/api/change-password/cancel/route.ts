import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { auth } from "@/auth";

type SessionToken = {
  userId?: string;
  iat?: number;
};

export async function POST(request: NextRequest) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }

  const token = (await getToken({
    req: request,
    secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
    secureCookie: new URL(request.url).protocol === "https:",
  })) as SessionToken | null;

  const marker = `${session.user.id}:${token?.iat ?? 0}`;

  const res = NextResponse.json({ message: "Đã bỏ qua đổi mật khẩu cho phiên hiện tại" });
  res.cookies.set("force_password_change_skipped", marker, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });

  return res;
}
