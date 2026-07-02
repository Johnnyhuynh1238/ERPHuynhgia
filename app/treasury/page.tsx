import { redirect } from "next/navigation";
import { UserRole } from "@prisma/client";
import { ProtectedLayout } from "@/components/protected-layout";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { TreasuryClient } from "./_components/treasury-client";

export default async function TreasuryPage() {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) redirect("/login");
  if (user.role !== UserRole.admin && user.role !== UserRole.accountant) {
    redirect("/?denied=treasury");
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
      <div className="space-y-3">
        <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
          <h1 className="text-xl font-semibold text-orange-300">Sổ quỹ công ty</h1>
          <p className="mt-1 text-xs text-[#8892b0]">
            Mọi giao dịch thu (chủ nhà chuyển khoản) và chi (lệnh chi, thầu phụ, vật tư, …) đều
            được ghi tự động ở đây. Số dư cập nhật luỹ kế theo thời gian thực.
          </p>
        </div>
        <TreasuryClient projects={projects} categories={categories} />
      </div>
    </ProtectedLayout>
  );
}
