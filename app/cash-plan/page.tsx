import { redirect } from "next/navigation";
import { UserRole } from "@prisma/client";
import { ProtectedLayout } from "@/components/protected-layout";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { CashPlanClient } from "./_components/cash-plan-client";

export const dynamic = "force-dynamic";

export default async function CashPlanPage() {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) redirect("/login");
  if (user.role !== UserRole.admin && user.role !== UserRole.accountant) {
    redirect("/?denied=cash-plan");
  }

  const projects = await prisma.project.findMany({
    orderBy: [{ status: "asc" }, { code: "asc" }],
    select: { id: true, code: true, name: true },
  });

  return (
    <ProtectedLayout>
      <CashPlanClient projects={projects} role={user.role} />
    </ProtectedLayout>
  );
}
