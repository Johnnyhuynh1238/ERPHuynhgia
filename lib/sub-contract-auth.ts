import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { canViewAllSubContracts } from "@/lib/sub-contract-utils";

export async function requireSubContractReadUser() {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    return {
      user: null,
      error: NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 }),
    };
  }

  return { user, error: null };
}

export async function requireSubContractWriteUser() {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    return {
      user: null,
      error: NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 }),
    };
  }

  if (user.role !== UserRole.admin && user.role !== UserRole.construction_manager) {
    return {
      user: null,
      error: NextResponse.json({ message: "Không có quyền" }, { status: 403 }),
    };
  }

  return { user, error: null };
}

export async function canUserAccessProjectSubContracts(projectId: string, user: { id: string; role: string }) {
  if (canViewAllSubContracts(user.role)) {
    return true;
  }

  if (user.role === UserRole.engineer || user.role === UserRole.foreman) {
    const member = await prisma.projectMember.findFirst({
      where: {
        projectId,
        userId: user.id,
      },
      select: { id: true },
    });

    return Boolean(member);
  }

  return false;
}

export async function canUserAccessSubContract(subContractId: string, user: { id: string; role: string }) {
  const row = await prisma.subContract.findUnique({
    where: { id: subContractId },
    select: { id: true, projectId: true },
  });

  if (!row) return { canAccess: false, projectId: null as string | null };

  const canAccess = await canUserAccessProjectSubContracts(row.projectId, user);
  return { canAccess, projectId: row.projectId };
}
