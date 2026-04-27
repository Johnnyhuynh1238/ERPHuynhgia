import { redirect } from "next/navigation";
import { UserRole } from "@prisma/client";
import { ProtectedLayout } from "@/components/protected-layout";
import { getCurrentUser } from "@/lib/auth-helpers";

export default async function PaymentsPage() {
  const user = await getCurrentUser();

  if (!user?.id || !user.role) {
    redirect("/login");
  }

  if (user.role !== UserRole.admin && user.role !== UserRole.accountant) {
    redirect("/?denied=payments");
  }

  return (
    <ProtectedLayout>
      <h1 className="text-xl font-semibold text-orange-300">Thanh toán</h1>
    </ProtectedLayout>
  );
}
