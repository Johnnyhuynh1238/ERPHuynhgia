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

export async function POST(request: Request, { params }: { params: { token: string } }) {
  const project = await resolvePortalProjectByToken(params.token);
  if (!project || !project.customerPortalEnabled || isPortalExpired(project.actualEndDate)) {
    return NextResponse.json({ message: "Liên kết không hợp lệ" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const password = String(body?.password || "").trim();
  if (!/^\d{4}$/.test(password)) {
    return NextResponse.json({ message: "Mật khẩu phải gồm 4 số" }, { status: 400 });
  }

  const ipAddress = getClientIpFromHeaders(request.headers);
  const userAgent = request.headers.get("user-agent") || "";

  const now = new Date();
  const keyToken = params.token;
  const windowStart = new Date(now.getTime() - WINDOW_MINUTES * 60 * 1000);

  const loginAttempt = await prisma.customerLoginAttempt.findUnique({
    where: {
      token_ipAddress: {
        token: keyToken,
        ipAddress,
      },
    },
  });

  if (loginAttempt?.blockedUntil && loginAttempt.blockedUntil > now) {
    return NextResponse.json({ message: "Đã khóa 30 phút do nhập sai nhiều lần" }, { status: 429 });
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
    valid = password === rawPassword;
  }

  if (!valid) {
    const currentAttempt =
      loginAttempt && loginAttempt.lastAttemptAt >= windowStart && (!loginAttempt.blockedUntil || loginAttempt.blockedUntil <= now)
        ? loginAttempt.attemptCount
        : 0;

    const nextAttempt = currentAttempt + 1;
    const blockedUntil = nextAttempt >= MAX_ATTEMPT ? new Date(Date.now() + BLOCK_MINUTES * 60 * 1000) : null;

    await prisma.customerLoginAttempt.upsert({
      where: {
        token_ipAddress: {
          token: keyToken,
          ipAddress,
        },
      },
      update: {
        attemptCount: nextAttempt,
        lastAttemptAt: now,
        blockedUntil,
      },
      create: {
        projectId: project.id,
        token: keyToken,
        ipAddress,
        attemptCount: nextAttempt,
        blockedUntil,
        lastAttemptAt: now,
      },
    });

    if (blockedUntil) {
      return NextResponse.json({ message: "Đã khóa 30 phút do nhập sai nhiều lần" }, { status: 429 });
    }

    return NextResponse.json({ message: `Mật khẩu chưa đúng (${nextAttempt}/${MAX_ATTEMPT} trong 30 phút)` }, { status: 401 });
  }

  if (loginAttempt) {
    await prisma.customerLoginAttempt.update({
      where: { id: loginAttempt.id },
      data: { attemptCount: 0, blockedUntil: null, lastAttemptAt: now },
    });
  }

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
