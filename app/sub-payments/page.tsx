import { redirect } from "next/navigation";
import { UserRole } from "@prisma/client";
import { ProtectedLayout } from "@/components/protected-layout";
import { getCurrentUser } from "@/lib/auth-helpers";
import { SubPaymentsClient } from "./sub-payments-client";

export default async function SubPaymentsPage() {
  const user = await getCurrentUser();

  if (!user?.id || !user.role) {
    redirect("/login");
  }

  if (user.role !== UserRole.admin && user.role !== UserRole.accountant) {
    redirect("/?denied=sub-payments");
  }

  return (
    <ProtectedLayout>
      <SubPaymentsClient currentRole={user.role} />
    </ProtectedLayout>
  );
}
