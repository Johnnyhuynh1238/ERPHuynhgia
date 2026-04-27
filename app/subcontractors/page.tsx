import { redirect } from "next/navigation";
import { ProtectedLayout } from "@/components/protected-layout";
import { getCurrentUser } from "@/lib/auth-helpers";
import { SubcontractorsClient } from "./_components/subcontractors-client";

export default async function SubcontractorsPage() {
  const user = await getCurrentUser();

  if (!user?.id || !user.role) {
    redirect("/login");
  }

  return (
    <ProtectedLayout>
      <SubcontractorsClient canWrite={["admin", "construction_manager"].includes(user.role)} />
    </ProtectedLayout>
  );
}
