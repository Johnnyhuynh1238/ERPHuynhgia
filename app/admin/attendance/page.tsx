import { redirect } from "next/navigation";
import { UserRole } from "@prisma/client";
import { ProtectedLayout } from "@/components/protected-layout";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { AttendanceAdminClient } from "./_components/attendance-admin-client";

export default async function AdminAttendancePage() {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    redirect("/login");
  }

  if (
    user.role !== UserRole.admin &&
    user.role !== UserRole.accountant &&
    user.role !== UserRole.construction_manager
  ) {
    redirect("/?denied=1");
  }

  const engineers = await prisma.user.findMany({
    where: { role: UserRole.engineer, isActive: true },
    select: { id: true, fullName: true, email: true, isActive: true },
    orderBy: { fullName: "asc" },
  });

  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  return (
    <ProtectedLayout>
      <AttendanceAdminClient
        initialMonth={month}
        engineers={engineers.map((u) => ({
          id: u.id,
          fullName: u.fullName,
          email: u.email,
          isActive: u.isActive,
        }))}
      />
    </ProtectedLayout>
  );
}
