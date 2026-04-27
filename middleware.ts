import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

type SessionToken = {
  userId?: string;
  mustChangePassword?: boolean;
};

function isStaticAsset(pathname: string) {
  return (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon.ico") ||
    pathname.startsWith("/uploads/") ||
    pathname.startsWith("/icons/") ||
    pathname.startsWith("/manifest") ||
    pathname.startsWith("/cn-manifest")
  );
}

export async function middleware(req: NextRequest) {
  const { nextUrl } = req;
  const pathname = nextUrl.pathname;

  if (isStaticAsset(pathname)) return NextResponse.next();

  // Tách luồng riêng cho cổng chủ nhà, không đi qua NextAuth middleware
  if (pathname.startsWith("/cn/")) {
    const segments = pathname.split("/").filter(Boolean);
    const token = segments[1] || "";
    const isPortalRoot = pathname === `/cn/${token}` || pathname === `/cn/${token}/`;
    const isPortalLoginPost = pathname === `/cn/${token}/login`;

    if (!token) {
      return NextResponse.rewrite(new URL("/404", nextUrl.origin));
    }

    if (!isPortalRoot && !isPortalLoginPost) {
      const hasPortalMarker = Boolean(req.cookies.get("cn_portal")?.value);
      if (!hasPortalMarker) {
        return NextResponse.redirect(new URL(`/cn/${token}`, nextUrl.origin));
      }
    }

    return NextResponse.next();
  }

  const isAuthRoute = pathname.startsWith("/api/auth");
  const isLoginRoute = pathname === "/login";
  const isForceChangeRoute = pathname === "/change-password" || pathname.startsWith("/api/change-password");

  if (isAuthRoute) return NextResponse.next();

  const token = (await getToken({
    req,
    secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
    secureCookie: nextUrl.protocol === "https:",
  })) as SessionToken | null;

  const isAuthenticated = Boolean(token?.userId);

  if (!isAuthenticated) {
    if (isLoginRoute) return NextResponse.next();

    const loginUrl = new URL("/login", nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", nextUrl.pathname + nextUrl.search);
    return NextResponse.redirect(loginUrl);
  }

  const mustChangePassword = Boolean(token?.mustChangePassword);

  if (mustChangePassword && !isForceChangeRoute && !isLoginRoute) {
    return NextResponse.redirect(new URL("/change-password", nextUrl.origin));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
