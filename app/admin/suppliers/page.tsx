import { redirect } from "next/navigation";
import { ProtectedLayout } from "@/components/protected-layout";
import { getCurrentUser } from "@/lib/auth-helpers";
import { SuppliersClient } from "./_components/suppliers-client";

export default async function SuppliersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin" && user.role !== "accountant") {
    redirect("/?denied=1");
  }

  return (
    <ProtectedLayout>
      <SuppliersClient />
    </ProtectedLayout>
  );
}
