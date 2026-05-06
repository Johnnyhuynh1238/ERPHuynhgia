import { redirect } from "next/navigation";
import { UserRole } from "@prisma/client";
import { ProtectedLayout } from "@/components/protected-layout";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { buildProjectAccessWhere } from "@/lib/project-permissions";
import { PaymentManagementClient } from "./_components/payment-management-client";

export default async function PaymentsPage() {
  const user = await getCurrentUser();

  if (!user?.id || !user.role) redirect("/login");
  if (user.role !== UserRole.admin && user.role !== UserRole.accountant) redirect("/?denied=payments");

  const projects = await prisma.project.findMany({
    where: buildProjectAccessWhere({ id: user.id, role: user.role }),
    orderBy: [{ status: "asc" }, { code: "asc" }],
    select: { id: true, code: true, name: true, customerName: true, contractValue: true },
  });

  return (
    <ProtectedLayout>
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-semibold text-orange-300">Thanh toán & bản vẽ</h1>
          <p className="text-sm text-[#8b95b7]">KT/Admin tạo lịch thanh toán, đánh dấu đã thu; Admin quản lý bản vẽ PDF cho cổng chủ nhà.</p>
        </div>
        <PaymentManagementClient
          isAdmin={user.role === UserRole.admin}
          projects={projects.map((project) => ({ ...project, contractValue: project.contractValue ? Number(project.contractValue) : null }))}
        />
      </div>
    </ProtectedLayout>
  );
}
