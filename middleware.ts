import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

type SessionToken = {
  userId?: string;
  mustChangePassword?: boolean;
  iat?: number;
};

function isStaticAsset(pathname: string) {
  return (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon.ico") ||
    pathname.startsWith("/uploads/") ||
    pathname.startsWith("/icons/") ||
    pathname.startsWith("/manifest") ||
    pathname.startsWith("/cn-manifest") ||
    pathname === "/sw-push.js"
  );
}

function applySecurityHeaders(res: NextResponse, isPortal: boolean) {
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Frame-Options", "SAMEORIGIN");
  res.headers.set("Referrer-Policy", isPortal ? "no-referrer" : "strict-origin-when-cross-origin");
  res.headers.set("Permissions-Policy", "camera=(self), microphone=(), geolocation=()");
  return res;
}

export async function middleware(req: NextRequest) {
  const { nextUrl } = req;
  const pathname = nextUrl.pathname;

  if (isStaticAsset(pathname)) return NextResponse.next();

  // /api/customer/[token]/* tự auth bằng portal session (cookie cn_session_*), không
  // đi qua NextAuth. Nếu để middleware NextAuth chặn, ảnh/file/comment của chủ nhà bị
  // redirect 307 về /login → trình duyệt render hỏng ảnh. Các API staff vẫn ở các path
  // khác (/api/customer-portal/, /api/customer-comments/...) nên không bypass nhầm.
  if (pathname.startsWith("/api/customer/")) {
    return applySecurityHeaders(NextResponse.next(), true);
  }

  // Một số API file/receipt dùng chung cho staff & customer; customer gọi kèm
  // ?token=<portalToken>. Route handler tự xác thực token qua requireCustomerPortalApiAccess.
  // Nếu để NextAuth chặn, chủ nhà bấm vào hồ sơ/biên lai/bản vẽ sẽ bị redirect về /login.
  if (nextUrl.searchParams.get("token")) {
    const portalApiWhitelist = [
      "/api/projects/",
      "/api/payment-schedules/",
      "/api/drawings/",
    ];
    if (portalApiWhitelist.some((prefix) => pathname.startsWith(prefix))) {
      return applySecurityHeaders(NextResponse.next(), true);
    }
  }

  // Cron endpoints tự auth bằng header x-cron-key. Không đi qua NextAuth.
  if (pathname.startsWith("/api/cron/")) {
    return applySecurityHeaders(NextResponse.next(), false);
  }

  // Tách luồng riêng cho cổng chủ nhà, không đi qua NextAuth middleware
  if (pathname.startsWith("/cn/")) {
    const segments = pathname.split("/").filter(Boolean);
    const token = segments[1] || "";
    const isPortalRoot = pathname === `/cn/${token}` || pathname === `/cn/${token}/`;
    const isPortalLoginPost = pathname === `/cn/${token}/login`;
    const isPortalManifest = pathname === `/cn/${token}/manifest.webmanifest`;

    if (!token) {
      return NextResponse.rewrite(new URL("/404", nextUrl.origin));
    }

    if (!isPortalRoot && !isPortalLoginPost && !isPortalManifest) {
      const hasPortalMarker = Boolean(req.cookies.get("cn_portal")?.value);
      if (!hasPortalMarker) {
        return NextResponse.redirect(new URL(`/cn/${token}`, nextUrl.origin));
      }
    }

    return applySecurityHeaders(NextResponse.next(), true);
  }

  const isAuthRoute = pathname.startsWith("/api/auth");
  const isLoginRoute = pathname === "/login";
  const isGuideRoute = pathname === "/huongdanapp" || pathname.startsWith("/huongdanapp/");
  const isForceChangeRoute = pathname === "/change-password" || pathname.startsWith("/api/change-password");

  if (isAuthRoute || isGuideRoute) return NextResponse.next();

  const token = (await getToken({
    req,
    secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
    secureCookie: nextUrl.protocol === "https:",
  })) as SessionToken | null;

  const isAuthenticated = Boolean(token?.userId);

  if (!isAuthenticated) {
    if (isLoginRoute) return applySecurityHeaders(NextResponse.next(), false);

    const loginUrl = new URL("/login", nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", nextUrl.pathname + nextUrl.search);
    return applySecurityHeaders(NextResponse.redirect(loginUrl), false);
  }

  const mustChangePassword = Boolean(token?.mustChangePassword);

  const skipForceCookie = req.cookies.get("force_password_change_skipped")?.value;
  const skipForceMarker = token?.iat ? `${token.userId}:${token.iat}` : "";
  const hasSkipForceForCurrentSession = Boolean(skipForceCookie && skipForceMarker && skipForceCookie === skipForceMarker);

  if (mustChangePassword && !isForceChangeRoute && !isLoginRoute && !hasSkipForceForCurrentSession) {
    return NextResponse.redirect(new URL("/change-password", nextUrl.origin));
  }

  return applySecurityHeaders(NextResponse.next(), false);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
