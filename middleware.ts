import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

type SessionToken = {
  userId?: string;
  role?: string;
  mustChangePassword?: boolean;
  iat?: number;
};

// SSO webterminal: mint cookie claude_code_session (đồng dạng /usr/local/bin/claude-web-auth:
// value = `${expiry}.${hmac_sha256_hex(SECRET, expiry)}`) cho parent domain .huynhgia6.com
// để iframe AI (huynhgia6.com/claude) nhận diện admin/accountant đã đăng nhập ERP — khỏi mật khẩu riêng.
const CLAUDE_COOKIE = "claude_code_session";
const CLAUDE_COOKIE_TTL = 30 * 24 * 60 * 60;

async function hmacHex(secret: string, msg: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(msg));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function isStaticAsset(pathname: string) {
  return (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon.ico") ||
    pathname.startsWith("/uploads/") ||
    pathname.startsWith("/icons/") ||
    pathname.startsWith("/manifest") ||
    pathname.startsWith("/cn-manifest") ||
    pathname === "/pay-logo.png" ||
    pathname === "/sw-push.js"
  );
}

function applySecurityHeaders(res: NextResponse, isPortal: boolean) {
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Frame-Options", "SAMEORIGIN");
  res.headers.set("Referrer-Policy", isPortal ? "no-referrer" : "strict-origin-when-cross-origin");
  res.headers.set(
    "Permissions-Policy",
    isPortal
      ? "camera=(self), microphone=(), geolocation=()"
      : "camera=(self), microphone=(), geolocation=(self)",
  );
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

  // OpenClaw đẩy item vào Inbox của GĐ — tự auth bằng Bearer token
  // (INBOX_API_TOKEN env). Không đi qua NextAuth.
  if (pathname === "/api/inbox") {
    return applySecurityHeaders(NextResponse.next(), false);
  }

  // Public lead capture + pricing API từ huynhgia6.com (form báo giá). Route tự
  // xử lý CORS + validation. Nếu để NextAuth chặn, preflight OPTIONS sẽ bị
  // redirect 307 → trình duyệt từ chối → form gửi lead chết toàn bộ.
  // Bao gồm:
  // - /api/leads/baogia (POST lead)
  // - /api/leads/baogia/calculate (POST pricing)
  // - /api/leads/baogia/session (POST issue HMAC token để gating /calculate — Đợt 4)
  if (
    pathname === "/api/leads/baogia" ||
    pathname === "/api/leads/baogia/calculate" ||
    pathname === "/api/leads/baogia/session"
  ) {
    return applySecurityHeaders(NextResponse.next(), false);
  }

  // Public web analytics ingest từ huynhgia6.com (pageview/scroll/cta/exit).
  // Route tự xử lý CORS + validation. Không gắn user-id → an toàn để mở public.
  if (pathname === "/api/analytics/web-event") {
    return applySecurityHeaders(NextResponse.next(), false);
  }

  // Trang theo dõi thanh toán công khai cho NCC (lệnh chi). Tự auth bằng
  // publicToken random trên URL — không gắn user, không đi qua NextAuth.
  // Gồm trang /pay/[token] và proxy ảnh CK /pay/[token]/receipt.
  if (pathname.startsWith("/pay/")) {
    return applySecurityHeaders(NextResponse.next(), true);
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

  const res = applySecurityHeaders(NextResponse.next(), false);

  // SSO cho iframe AI: admin/accountant đã đăng nhập ERP → tự có cookie webterminal
  // (same-site .huynhgia6.com). Chỉ set khi thiếu + đúng domain prod + có secret.
  const secret = process.env.CLAUDE_WEB_SECRET;
  if (
    secret &&
    (token?.role === "admin" || token?.role === "accountant") &&
    !req.cookies.get(CLAUDE_COOKIE) &&
    nextUrl.hostname.endsWith("huynhgia6.com")
  ) {
    const expiry = Math.floor(Date.now() / 1000) + CLAUDE_COOKIE_TTL;
    const value = `${expiry}.${await hmacHex(secret, String(expiry))}`;
    res.cookies.set({
      name: CLAUDE_COOKIE,
      value,
      domain: ".huynhgia6.com",
      path: "/",
      maxAge: CLAUDE_COOKIE_TTL,
      secure: true,
      httpOnly: true,
      sameSite: "lax",
    });
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
