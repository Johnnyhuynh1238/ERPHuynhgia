import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";

export const CUSTOMER_SESSION_COOKIE_PREFIX = "cn_session_";
const CUSTOMER_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 90;

export function derivePortalPassword(input: { customerPortalPassword: string | null; customerIdNumber: string | null; customerPhone: string }) {
  if (input.customerPortalPassword && input.customerPortalPassword.trim()) return input.customerPortalPassword.trim();

  const source = (input.customerIdNumber || input.customerPhone || "").replace(/\D/g, "");
  if (!source) return null;
  return source.slice(-4).padStart(4, "0");
}

export function getPortalExpiry(actualEndDate: Date | null) {
  if (!actualEndDate) return null;
  const expiry = new Date(actualEndDate);
  expiry.setUTCDate(expiry.getUTCDate() + 30);
  expiry.setUTCHours(23, 59, 59, 999);
  return expiry;
}

export function isPortalExpired(actualEndDate: Date | null) {
  const expiry = getPortalExpiry(actualEndDate);
  if (!expiry) return false;
  return new Date() > expiry;
}

export function getCustomerSessionCookieName(projectId: string) {
  return `${CUSTOMER_SESSION_COOKIE_PREFIX}${projectId}`;
}

export function getClientIpFromHeaders(headers: Headers) {
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return headers.get("x-real-ip") || "0.0.0.0";
}

export async function resolvePortalProjectByToken(token: string) {
  return prisma.project.findUnique({
    where: { customerPortalToken: token },
    select: {
      id: true,
      code: true,
      name: true,
      address: true,
      customerName: true,
      customerPhone: true,
      customerIdNumber: true,
      actualEndDate: true,
      customerPortalEnabled: true,
      customerPortalPassword: true,
      customerPortalToken: true,
      startDate: true,
      expectedEndDate: true,
      status: true,
      projectManagerId: true,
      mainEngineerId: true,
    },
  });
}

export async function createCustomerSession(projectId: string, args: { ipAddress?: string | null; userAgent?: string | null }) {
  const tokenId = randomUUID();
  const expiresAt = new Date(Date.now() + CUSTOMER_SESSION_MAX_AGE_SECONDS * 1000);

  await prisma.customerSession.create({
    data: {
      projectId,
      tokenId,
      ipAddress: args.ipAddress || null,
      userAgent: args.userAgent || null,
      expiresAt,
    },
  });

  return { tokenId, expiresAt };
}

export async function resolveCustomerSessionByToken(projectId: string, tokenId: string) {
  if (!tokenId) return null;

  const session = await prisma.customerSession.findFirst({
    where: {
      projectId,
      tokenId,
      expiresAt: { gt: new Date() },
    },
    select: {
      id: true,
      projectId: true,
      tokenId: true,
      expiresAt: true,
      loggedInAt: true,
    },
  });

  return session;
}

export type PortalAccessState = "ok" | "not_found" | "disabled" | "expired";

export async function requirePortalPageAccess(token: string) {
  const project = await resolvePortalProjectByToken(token);
  if (!project) {
    return { project: null, session: null, state: "not_found" as PortalAccessState };
  }

  if (!project.customerPortalEnabled) {
    return { project, session: null, state: "disabled" as PortalAccessState };
  }

  if (isPortalExpired(project.actualEndDate)) {
    return { project, session: null, state: "expired" as PortalAccessState };
  }

  const cookieStore = cookies();
  const cookieName = getCustomerSessionCookieName(project.id);
  const tokenId = cookieStore.get(cookieName)?.value || "";
  const session = await resolveCustomerSessionByToken(project.id, tokenId);
  return { project, session, state: "ok" as PortalAccessState };
}

export function getCustomerSessionMaxAge() {
  return CUSTOMER_SESSION_MAX_AGE_SECONDS;
}
