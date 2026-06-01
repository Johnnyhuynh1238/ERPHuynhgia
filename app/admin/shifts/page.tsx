import { redirect } from "next/navigation";
import { UserRole } from "@prisma/client";
import { ProtectedLayout } from "@/components/protected-layout";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { ShiftsAdminClient } from "./_components/shifts-admin-client";

export default async function AdminShiftsPage() {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    redirect("/login");
  }

  if (user.role !== UserRole.admin && user.role !== UserRole.accountant) {
    redirect("/?denied=1");
  }

  const candidates = await prisma.user.findMany({
    where: {
      isActive: true,
      role: { in: [UserRole.engineer, UserRole.accountant] },
    },
    select: { id: true, fullName: true, email: true, role: true },
    orderBy: [{ role: "asc" }, { fullName: "asc" }],
  });

  return (
    <ProtectedLayout>
      <ShiftsAdminClient
        candidates={candidates.map((c) => ({
          id: c.id,
          fullName: c.fullName,
          email: c.email,
          role: c.role,
        }))}
      />
    </ProtectedLayout>
  );
}
