import { redirect } from "next/navigation";
import { UserRole } from "@prisma/client";
import { ProtectedLayout } from "@/components/protected-layout";
import { getCurrentUser } from "@/lib/auth-helpers";
import { FinanceOverviewClient } from "./_components/finance-overview-client";

export const dynamic = "force-dynamic";

export default async function FinanceOverviewPage() {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) redirect("/login");
  if (user.role !== UserRole.admin) redirect("/?denied=finance-overview");

  return (
    <ProtectedLayout>
      <FinanceOverviewClient />
    </ProtectedLayout>
  );
}
