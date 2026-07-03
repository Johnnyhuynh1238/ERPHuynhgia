import { redirect } from "next/navigation";
import { UserRole } from "@prisma/client";
import { ProtectedLayout } from "@/components/protected-layout";
import { getCurrentUser } from "@/lib/auth-helpers";
import { FinanceOverviewClient } from "./_components/finance-overview-client";

export default async function FinancePage() {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) redirect("/login");
  if (user.role !== UserRole.admin) redirect("/?denied=finance");

  return (
    <ProtectedLayout>
      <div className="space-y-3">
        <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
          <h1 className="text-xl font-semibold text-orange-300">Tài chính công ty</h1>
          <p className="mt-1 text-xs text-[#8892b0]">
            Doanh thu đã thu theo hợp đồng, chi phí từng dự án + chi chung công ty, công nợ khách
            hàng / NCC / thầu phụ. Bấm dự án để xem tài chính chi tiết.
          </p>
        </div>
        <FinanceOverviewClient />
      </div>
    </ProtectedLayout>
  );
}
