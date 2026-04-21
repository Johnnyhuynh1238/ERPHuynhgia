import { Prisma, UserRole } from "@prisma/client";

export function buildProjectAccessWhere(user: { id: string; role: string }): Prisma.ProjectWhereInput {
  const isAdminLike = user.role === UserRole.admin || user.role === UserRole.accountant;

  if (isAdminLike) {
    return {};
  }

  return {
    OR: [
      { projectManagerId: user.id },
      { mainEngineerId: user.id },
      {
        projectMembers: {
          some: {
            userId: user.id,
          },
        },
      },
    ],
  };
}
