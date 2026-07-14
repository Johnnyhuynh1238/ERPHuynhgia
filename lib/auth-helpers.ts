import { CommentTargetType, Prisma } from "@prisma/client";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { readImpersonationTarget } from "@/lib/impersonation";
import { prisma } from "@/lib/prisma";
import { buildProjectAccessWhere } from "@/lib/project-permissions";
import {
  getCustomerSessionCookieName,
  isPortalExpired,
  resolvePortalProjectByToken,
  resolveCustomerSessionByToken,
} from "@/lib/customer-portal";

type AppRole = "admin" | "engineer" | "foreman" | "accountant" | "construction_manager";

export async function getCurrentUser() {
  const session = await auth();
  if (!session?.user?.id) return null;

  // Admin đóng vai user khác (cookie HMAC 60'): swap sang user đích.
  // Chỉ admin thật mới được swap; user đích không phải admin.
  // Cho phép đổi vai cả user đã bị khoá (isActive=false) để admin xem/hỗ trợ tk nhân viên đã nghỉ.
  if (session.user.role === "admin") {
    const targetId = readImpersonationTarget();
    if (targetId && targetId !== session.user.id) {
      const target = await prisma.user.findUnique({
        where: { id: targetId },
        select: { id: true, email: true, fullName: true, role: true, isActive: true },
      });
      if (target && target.role !== "admin") {
        return {
          ...session.user,
          id: target.id,
          email: target.email,
          name: target.fullName,
          role: target.role,
          impersonatedBy: { id: session.user.id, name: session.user.name ?? session.user.email ?? "admin" },
        };
      }
    }
  }

  return session.user;
}

// User thật từ session, bỏ qua impersonation — dùng cho API bật/tắt đóng vai.
export async function getRealSessionUser() {
  const session = await auth();
  if (!session?.user?.id) return null;
  return session.user;
}

export async function requireRole(roles: AppRole[]) {
  const user = await getCurrentUser();

  if (!user || !user.role) {
    throw new Error("401_UNAUTHORIZED");
  }

  if (!roles.includes(user.role as AppRole)) {
    throw new Error("403_FORBIDDEN");
  }

  return user;
}

export async function getCustomerPortalSessionByToken(token: string) {
  const project = await resolvePortalProjectByToken(token);
  if (!project || !project.customerPortalEnabled || isPortalExpired(project.actualEndDate)) {
    return { project: null, session: null as null | { tokenId: string } };
  }

  const cookieStore = cookies();
  const sessionTokenId = cookieStore.get(getCustomerSessionCookieName(project.id))?.value;
  if (!sessionTokenId) {
    return { project, session: null };
  }

  const session = await resolveCustomerSessionByToken(project.id, sessionTokenId);
  if (!session) {
    return { project, session: null };
  }

  return { project, session: { tokenId: session.tokenId } };
}

export async function getStaffCommentUnreadCount(userId: string, role: string) {
  if (!["admin", "construction_manager", "engineer", "accountant"].includes(role)) return 0;

  const projectWhere: Prisma.ProjectWhereInput = role === "engineer" ? buildProjectAccessWhere({ id: userId, role }) : {};
  const targetWhere: Prisma.CustomerCommentWhereInput =
    role === "accountant"
      ? { targetType: CommentTargetType.payment_schedule }
      : role === "engineer"
        ? { OR: [{ targetType: { in: [CommentTargetType.project, CommentTargetType.task, CommentTargetType.journal_entry] } }, { targetType: null }] }
        : {};

  const count = await prisma.customerComment.count({
    where: {
      readByStaff: false,
      project: projectWhere,
      ...targetWhere,
    },
  });

  return count;
}
