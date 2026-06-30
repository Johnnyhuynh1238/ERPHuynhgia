import { redirect } from "next/navigation";
import { UserRole } from "@prisma/client";
import { ProtectedLayout } from "@/components/protected-layout";
import { getCurrentUser } from "@/lib/auth-helpers";
import { PayablesClient } from "./_components/payables-client";

export const dynamic = "force-dynamic";

export default async function PayablesPage() {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) redirect("/login");
  if (user.role !== UserRole.admin && user.role !== UserRole.accountant) {
    redirect("/?denied=payables");
  }

  return (
    <ProtectedLayout>
      <PayablesClient />
    </ProtectedLayout>
  );
}
