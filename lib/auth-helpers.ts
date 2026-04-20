import { auth } from "@/auth";
import { UserRole } from "@prisma/client";

export async function getCurrentUser() {
  const session = await auth();
  return session?.user ?? null;
}

export async function requireRole(roles: UserRole[]) {
  const user = await getCurrentUser();

  if (!user || !user.role) {
    throw new Error("401_UNAUTHORIZED");
  }

  if (!roles.includes(user.role as UserRole)) {
    throw new Error("403_FORBIDDEN");
  }

  return user;
}
