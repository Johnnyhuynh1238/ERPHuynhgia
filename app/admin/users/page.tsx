import { redirect } from "next/navigation";
import { ProtectedLayout } from "@/components/protected-layout";
import { getCurrentUser } from "@/lib/auth-helpers";
import { AdminUsersClient } from "./_components/admin-users-client";

export default async function UsersPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.role !== "admin") {
    redirect("/?denied=1");
  }

  return (
    <ProtectedLayout>
      <AdminUsersClient currentUserId={user.id} />
    </ProtectedLayout>
  );
}
