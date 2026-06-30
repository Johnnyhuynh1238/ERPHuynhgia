import { redirect } from "next/navigation";
import { UserRole } from "@prisma/client";
import { ProtectedLayout } from "@/components/protected-layout";
import { getCurrentUser } from "@/lib/auth-helpers";
import { PaymentOrdersClient } from "./_components/payment-orders-client";

export const dynamic = "force-dynamic";

export default async function PaymentOrdersPage() {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) redirect("/login");
  if (user.role !== UserRole.admin && user.role !== UserRole.accountant) {
    redirect("/?denied=payment-orders");
  }

  return (
    <ProtectedLayout>
      <PaymentOrdersClient
        isAdmin={user.role === UserRole.admin}
      />
    </ProtectedLayout>
  );
}
