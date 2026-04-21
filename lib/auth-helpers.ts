import { auth } from "@/auth";

type AppRole = "admin" | "engineer" | "foreman" | "accountant" | "construction_manager";

export async function getCurrentUser() {
  const session = await auth();
  return session?.user ?? null;
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
