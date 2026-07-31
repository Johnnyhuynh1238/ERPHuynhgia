import { redirect } from "next/navigation";
import { UserRole } from "@prisma/client";
import { ProtectedLayout } from "@/components/protected-layout";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { ExpensesClient } from "./_components/expenses-client";

export default async function ExpensesPage() {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) redirect("/login");
  if (user.role !== UserRole.admin && user.role !== UserRole.accountant) {
    redirect("/?denied=expenses");
  }

  const [projects, categories, designContracts] = await Promise.all([
    prisma.project.findMany({
      orderBy: [{ status: "asc" }, { code: "asc" }],
      select: { id: true, code: true, name: true },
    }),
    prisma.expenseCategory.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, code: true, name: true, scope: true },
    }),
    prisma.designContract.findMany({
      orderBy: [{ status: "asc" }, { signedAt: "desc" }],
      select: { id: true, customerName: true, signedAt: true },
    }),
  ]);

  return (
    <ProtectedLayout>
      <div className="space-y-4">
        <ExpensesClient
          role={user.role}
          projects={projects}
          categories={categories}
          designContracts={designContracts.map((c) => ({
            id: c.id,
            customerName: c.customerName,
            signedAt: c.signedAt.toISOString().slice(0, 10),
          }))}
        />
      </div>
    </ProtectedLayout>
  );
}
