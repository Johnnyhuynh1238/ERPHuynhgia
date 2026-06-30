import { redirect } from "next/navigation";
import { ProtectedLayout } from "@/components/protected-layout";
import { getCurrentUser } from "@/lib/auth-helpers";
import { SupplierDetailClient } from "./_components/supplier-detail-client";

export default async function SupplierDetailPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin" && user.role !== "accountant") {
    redirect("/?denied=1");
  }

  return (
    <ProtectedLayout>
      <SupplierDetailClient supplierId={params.id} />
    </ProtectedLayout>
  );
}
