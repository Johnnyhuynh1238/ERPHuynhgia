import { redirect } from "next/navigation";
import { UserRole } from "@prisma/client";
import { ProtectedLayout } from "@/components/protected-layout";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { DebtsClient } from "./_components/debts-client";

export const dynamic = "force-dynamic";

export default async function DebtsPage() {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) redirect("/login");
  if (user.role !== UserRole.admin && user.role !== UserRole.accountant) {
    redirect("/?denied=debts");
  }

  // Id danh mục để tạo lệnh chi gắn khoản vay / tạm ứng.
  const cats = await prisma.expenseCategory.findMany({
    where: { code: { in: ["TRANOGOC", "LAIVAY", "TAMUNG"] } },
    select: { id: true, code: true },
  });
  const catId = Object.fromEntries(cats.map((c) => [c.code, c.id])) as Record<string, string | undefined>;

  return (
    <ProtectedLayout>
      <DebtsClient
        role={user.role}
        categoryIds={{
          TRANOGOC: catId.TRANOGOC ?? "",
          LAIVAY: catId.LAIVAY ?? "",
          TAMUNG: catId.TAMUNG ?? "",
        }}
      />
    </ProtectedLayout>
  );
}
