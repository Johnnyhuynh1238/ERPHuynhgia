import { redirect } from "next/navigation";
import { UserRole } from "@prisma/client";
import { ProtectedLayout } from "@/components/protected-layout";
import { getCurrentUser } from "@/lib/auth-helpers";
import { PaymentOrderDetailClient } from "./_components/payment-order-detail-client";

export const dynamic = "force-dynamic";

export default async function PaymentOrderDetailPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) redirect("/login");
  if (user.role !== UserRole.admin && user.role !== UserRole.accountant) {
    redirect("/?denied=payment-orders");
  }

  return (
    <ProtectedLayout>
      <PaymentOrderDetailClient
        orderId={params.id}
        currentUserId={user.id}
        isAdmin={user.role === UserRole.admin}
      />
    </ProtectedLayout>
  );
}
