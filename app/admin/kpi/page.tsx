import { redirect } from "next/navigation";
import { UserRole } from "@prisma/client";
import { ProtectedLayout } from "@/components/protected-layout";
import { getCurrentUser } from "@/lib/auth-helpers";
import { parseMonthInput } from "@/lib/date";
import { buildProjectAccessWhere } from "@/lib/project-permissions";
import { prisma } from "@/lib/prisma";
import { AdminKpiClient } from "./_components/admin-kpi-client";

export default async function AdminKpiPage() {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    redirect("/login");
  }

  if (user.role !== UserRole.admin && user.role !== UserRole.accountant && user.role !== UserRole.construction_manager) {
    redirect("/?denied=1");
  }

  const { month } = parseMonthInput(null);

  const projects = await prisma.project.findMany({
    where: {
      ...buildProjectAccessWhere({ id: user.id, role: user.role }),
      goLiveDate: { not: null },
    },
    select: {
      id: true,
      code: true,
      name: true,
      goLiveDate: true,
    },
    orderBy: { code: "asc" },
  });

  return (
    <ProtectedLayout>
      <AdminKpiClient
        initialData={{
          month,
          canSeeDetail: user.role !== UserRole.accountant,
          rows: [],
          projects: projects.map((project) => ({
            id: project.id,
            code: project.code,
            name: project.name,
            goLiveDate: project.goLiveDate?.toISOString() || null,
          })),
        }}
        canSeeDetail={user.role !== UserRole.accountant}
      />
    </ProtectedLayout>
  );
}
