import { NextResponse } from "next/server";
import { issueBaogiaToken } from "@/lib/baogia-session";
import { checkRate } from "@/lib/baogia-ratelimit";

const ALLOWED_ORIGINS = new Set([
  "https://huynhgia6.com",
  "https://www.huynhgia6.com",
]);

function corsHeaders(origin: string | null) {
  const allow = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://huynhgia6.com";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Cache-Control": "no-store",
    "X-Robots-Tag": "noindex, nofollow",
    Vary: "Origin",
  };
}

function clientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  const xri = request.headers.get("x-real-ip");
  if (xri) return xri.trim();
  return "0.0.0.0";
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(request.headers.get("origin")),
  });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);
  const ip = clientIp(request);

  // /session cũng phải đi qua rate limit để bot không spam-issue token.
  // comboKey "session" → dùng chung counter với /calculate trong cùng IP window.
  const rate = checkRate(ip, "__session__");
  if (!rate.allow) {
    return NextResponse.json(
      { ok: false, message: "Quá nhiều yêu cầu", reason: rate.reason },
      {
        status: 429,
        headers: { ...headers, "Retry-After": String(rate.retryAfterSec) },
      },
    );
  }

  try {
    const { token, expiresAt } = issueBaogiaToken(ip);
    return NextResponse.json({ ok: true, token, expiresAt }, { status: 200, headers });
  } catch (err) {
    console.error("[baogia/session] issue failed:", err);
    return NextResponse.json(
      { ok: false, message: "Không phát hành được phiên" },
      { status: 500, headers },
    );
  }
}
