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

  const [projects, categories] = await Promise.all([
    prisma.project.findMany({
      orderBy: [{ status: "asc" }, { code: "asc" }],
      select: { id: true, code: true, name: true },
    }),
    prisma.expenseCategory.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, code: true, name: true },
    }),
  ]);

  return (
    <ProtectedLayout>
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-semibold text-orange-300">Lệnh chi</h1>
          <p className="text-sm text-[#8b95b7]">
            Admin tạo lệnh chi cho kế toán thanh toán (vật tư ngoài đề xuất, văn phòng, máy móc, …).
            Mỗi lần KT đánh dấu đã chi sẽ trừ vào số dư công ty trong sổ quỹ.
          </p>
        </div>
        <ExpensesClient
          role={user.role}
          projects={projects}
          categories={categories}
        />
      </div>
    </ProtectedLayout>
  );
}
