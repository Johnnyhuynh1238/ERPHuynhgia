import { redirect } from "next/navigation";
import { UserRole } from "@prisma/client";
import { ProtectedLayout } from "@/components/protected-layout";
import { getCurrentUser } from "@/lib/auth-helpers";
import { AdminEngineerSalaryClient } from "./_components/admin-engineer-salary-client";

export default async function AdminEngineerSalaryPage() {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    redirect("/login");
  }

  if (user.role !== UserRole.admin) {
    redirect("/?denied=1");
  }

  return (
    <ProtectedLayout>
      <AdminEngineerSalaryClient />
    </ProtectedLayout>
  );
}
