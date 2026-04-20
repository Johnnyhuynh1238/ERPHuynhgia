import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

export async function middleware(req: NextRequest) {
  const { nextUrl } = req;
  const pathname = nextUrl.pathname;

  const isStaticRoute = pathname.startsWith("/_next") || pathname.startsWith("/favicon.ico");
  if (isStaticRoute) return NextResponse.next();

  const isAuthRoute = pathname.startsWith("/api/auth");
  const isLoginRoute = pathname === "/login";
  const isForceChangeRoute = pathname === "/change-password" || pathname.startsWith("/api/change-password");

  if (isAuthRoute) return NextResponse.next();

  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
  });

  if (!token) {
    if (isLoginRoute) return NextResponse.next();

    const loginUrl = new URL("/login", nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", nextUrl.pathname + nextUrl.search);
    return NextResponse.redirect(loginUrl);
  }

  const mustChangePassword = Boolean((token as { mustChangePassword?: boolean }).mustChangePassword);

  if (mustChangePassword && !isForceChangeRoute) {
    return NextResponse.redirect(new URL("/change-password", nextUrl.origin));
  }

  if (!mustChangePassword && isLoginRoute) {
    return NextResponse.redirect(new URL("/", nextUrl.origin));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
