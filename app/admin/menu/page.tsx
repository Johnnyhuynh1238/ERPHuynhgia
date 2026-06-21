import { redirect } from "next/navigation";
import { ProtectedLayout } from "@/components/protected-layout";
import { getCurrentUser } from "@/lib/auth-helpers";
import { AdminMenuClient } from "./_components/admin-menu-client";

export default async function AdminMenuPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/?denied=1");

  return (
    <ProtectedLayout>
      <AdminMenuClient />
    </ProtectedLayout>
  );
}
