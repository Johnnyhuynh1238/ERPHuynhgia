import { Prisma, UserRole } from "@prisma/client";

export function buildProjectAccessWhere(user: { id: string; role: string }): Prisma.ProjectWhereInput {
  if (user.role === UserRole.admin) {
    return {};
  }

  // Source of truth: chỉ user có assignment mới thấy dự án.
  return {
    memberAssignments: {
      some: {
        userId: user.id,
      },
    },
  };
}
