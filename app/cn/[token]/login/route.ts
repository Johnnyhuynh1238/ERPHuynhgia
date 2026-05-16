import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import {
  createCustomerSession,
  derivePortalPassword,
  getClientIpFromHeaders,
  getCustomerSessionCookieName,
  getCustomerSessionMaxAge,
  isPortalExpired,
  resolvePortalProjectByToken,
} from "@/lib/customer-portal";

const MAX_ATTEMPT = 5;
const BLOCK_MINUTES = 30;
const WINDOW_MINUTES = 30;

// Global per-token: chống brute với rotating IP. 50 sai trong 60 phút → block 60 phút.
const GLOBAL_MAX_ATTEMPT = 50;
const GLOBAL_WINDOW_MINUTES = 60;
const GLOBAL_BLOCK_MINUTES = 60;
const GLOBAL_IP_MARKER = "__global__";

export async function POST(request: Request, { params }: { params: { token: string } }) {
  const project = await resolvePortalProjectByToken(params.token);
  if (!project || !project.customerPortalEnabled || isPortalExpired(project.actualEndDate)) {
    return NextResponse.json({ message: "Liên kết không hợp lệ" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const password = String(body?.password || "").trim();
  // Chấp nhận: 4 chữ số (legacy/default last4 phone) hoặc 6-32 ký tự alphanumeric+symbol (custom)
  const legacy4digits = /^\d{4}$/;
  const customStrong = /^[A-Za-z0-9!@#$%^&*_-]{6,32}$/;
  if (!legacy4digits.test(password) && !customStrong.test(password)) {
    return NextResponse.json({ message: "Mật khẩu không đúng định dạng" }, { status: 400 });
  }

  const ipAddress = getClientIpFromHeaders(request.headers);
  const userAgent = request.headers.get("user-agent") || "";

  const now = new Date();
  const keyToken = params.token;
  const windowStart = new Date(now.getTime() - WINDOW_MINUTES * 60 * 1000);

  const [loginAttempt, globalAttempt] = await Promise.all([
    prisma.customerLoginAttempt.findUnique({
      where: { token_ipAddress: { token: keyToken, ipAddress } },
    }),
    prisma.customerLoginAttempt.findUnique({
      where: { token_ipAddress: { token: keyToken, ipAddress: GLOBAL_IP_MARKER } },
    }),
  ]);

  if (loginAttempt?.blockedUntil && loginAttempt.blockedUntil > now) {
    return NextResponse.json({ message: "Đã khóa 30 phút do nhập sai nhiều lần" }, { status: 429 });
  }
  if (globalAttempt?.blockedUntil && globalAttempt.blockedUntil > now) {
    return NextResponse.json({ message: "Cổng đang tạm khóa do nghi vấn dò mật khẩu. Vui lòng liên hệ Huỳnh Gia." }, { status: 429 });
  }

  const rawPassword = derivePortalPassword({
    customerPortalPassword: project.customerPortalPassword,
    customerIdNumber: project.customerIdNumber,
    customerPhone: project.customerPhone,
  });

  if (!rawPassword) {
    return NextResponse.json({ message: "Dự án chưa có mật khẩu truy cập. Vui lòng liên hệ Huỳnh Gia." }, { status: 400 });
  }

  let valid = false;
  if (project.customerPortalPassword?.startsWith("$2")) {
    valid = await bcrypt.compare(password, project.customerPortalPassword);
  } else {
    const a = Buffer.from(password);
    const b = Buffer.from(rawPassword);
    valid = a.length === b.length && timingSafeEqual(a, b);
    if (valid && project.customerPortalPassword && !project.customerPortalPassword.startsWith("$2")) {
      const hashed = await bcrypt.hash(project.customerPortalPassword, 10);
      await prisma.project
        .update({ where: { id: project.id }, data: { customerPortalPassword: hashed } })
        .catch(() => {});
    }
  }

  if (!valid) {
    const currentAttempt =
      loginAttempt && loginAttempt.lastAttemptAt >= windowStart && (!loginAttempt.blockedUntil || loginAttempt.blockedUntil <= now)
        ? loginAttempt.attemptCount
        : 0;

    const nextAttempt = currentAttempt + 1;
    const blockedUntil = nextAttempt >= MAX_ATTEMPT ? new Date(Date.now() + BLOCK_MINUTES * 60 * 1000) : null;

    const globalWindowStart = new Date(now.getTime() - GLOBAL_WINDOW_MINUTES * 60 * 1000);
    const currentGlobal =
      globalAttempt && globalAttempt.lastAttemptAt >= globalWindowStart && (!globalAttempt.blockedUntil || globalAttempt.blockedUntil <= now)
        ? globalAttempt.attemptCount
        : 0;
    const nextGlobal = currentGlobal + 1;
    const globalBlockedUntil = nextGlobal >= GLOBAL_MAX_ATTEMPT ? new Date(Date.now() + GLOBAL_BLOCK_MINUTES * 60 * 1000) : null;

    await Promise.all([
      prisma.customerLoginAttempt.upsert({
        where: { token_ipAddress: { token: keyToken, ipAddress } },
        update: { attemptCount: nextAttempt, lastAttemptAt: now, blockedUntil },
        create: { projectId: project.id, token: keyToken, ipAddress, attemptCount: nextAttempt, blockedUntil, lastAttemptAt: now },
      }),
      prisma.customerLoginAttempt.upsert({
        where: { token_ipAddress: { token: keyToken, ipAddress: GLOBAL_IP_MARKER } },
        update: { attemptCount: nextGlobal, lastAttemptAt: now, blockedUntil: globalBlockedUntil },
        create: { projectId: project.id, token: keyToken, ipAddress: GLOBAL_IP_MARKER, attemptCount: nextGlobal, blockedUntil: globalBlockedUntil, lastAttemptAt: now },
      }),
    ]);

    if (globalBlockedUntil) {
      console.warn(`[portal-login] GLOBAL_BLOCK token=${keyToken.slice(0, 8)}... attempts=${nextGlobal} ip=${ipAddress}`);
      return NextResponse.json({ message: "Cổng đang tạm khóa do nghi vấn dò mật khẩu. Vui lòng liên hệ Huỳnh Gia." }, { status: 429 });
    }
    if (blockedUntil) {
      return NextResponse.json({ message: "Đã khóa 30 phút do nhập sai nhiều lần" }, { status: 429 });
    }

    return NextResponse.json({ message: `Mật khẩu chưa đúng (${nextAttempt}/${MAX_ATTEMPT} trong 30 phút)` }, { status: 401 });
  }

  // Reset cả per-IP và global khi login thành công
  await Promise.all([
    loginAttempt
      ? prisma.customerLoginAttempt.update({
          where: { id: loginAttempt.id },
          data: { attemptCount: 0, blockedUntil: null, lastAttemptAt: now },
        })
      : Promise.resolve(),
    globalAttempt
      ? prisma.customerLoginAttempt.update({
          where: { id: globalAttempt.id },
          data: { attemptCount: 0, blockedUntil: null, lastAttemptAt: now },
        })
      : Promise.resolve(),
  ]);

  const session = await createCustomerSession(project.id, { ipAddress, userAgent });

  const response = NextResponse.json({ ok: true });
  response.cookies.set(getCustomerSessionCookieName(project.id), session.tokenId, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: getCustomerSessionMaxAge(),
    path: "/",
  });
  response.cookies.set("cn_portal", "1", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: getCustomerSessionMaxAge(),
    path: "/",
  });

  return response;
}
