import { UserRole } from "@prisma/client";

const STAFF_VIEW_ROLES = new Set<string>([
  UserRole.accountant,
  UserRole.admin,
  UserRole.construction_manager,
]);

export function isProposalStaffViewer(role: string | null | undefined) {
  return Boolean(role && STAFF_VIEW_ROLES.has(role));
}

export function canViewProposal(
  role: string | null | undefined,
  proposalKsId: string,
  userId: string,
) {
  if (isProposalStaffViewer(role)) return true;
  return role === UserRole.engineer && proposalKsId === userId;
}

export function canCommentOnProposal(role: string | null | undefined) {
  if (!role) return false;
  return (
    role === UserRole.engineer ||
    role === UserRole.accountant ||
    role === UserRole.construction_manager ||
    role === UserRole.admin
  );
}
