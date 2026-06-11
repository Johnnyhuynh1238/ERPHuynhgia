import { redirect } from "next/navigation";
import { ProtectedLayout } from "@/components/protected-layout";
import { getCurrentUser } from "@/lib/auth-helpers";
import { AdminDashboardClient } from "./_components/admin-dashboard-client";

export default async function AdminDashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/?denied=1");

  return (
    <ProtectedLayout>
      <AdminDashboardClient />
    </ProtectedLayout>
  );
}
