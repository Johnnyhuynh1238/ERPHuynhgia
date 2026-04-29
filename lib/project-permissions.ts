import { Prisma, UserRole } from "@prisma/client";

export function buildProjectAccessWhere(user: { id: string; role: string }): Prisma.ProjectWhereInput {
  if (user.role === UserRole.admin) {
    return {};
  }

  // Source of truth: phải được admin add vào member/assignment mới thấy dự án.
  return {
    OR: [
      {
        projectMembers: {
          some: {
            userId: user.id,
          },
        },
      },
      {
        memberAssignments: {
          some: {
            userId: user.id,
          },
        },
      },
    ],
  };
}
