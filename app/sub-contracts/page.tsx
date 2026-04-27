import { redirect } from "next/navigation";
import { ProtectedLayout } from "@/components/protected-layout";
import { getCurrentUser } from "@/lib/auth-helpers";
import { SubContractsClient } from "./sub-contracts-client";

export default async function SubContractsPage() {
  const user = await getCurrentUser();

  if (!user?.id || !user.role) {
    redirect("/login");
  }

  if (!["admin", "construction_manager", "accountant"].includes(user.role)) {
    redirect("/projects?denied=1");
  }

  return (
    <ProtectedLayout>
      <SubContractsClient canCreate={["admin", "construction_manager"].includes(user.role)} />
    </ProtectedLayout>
  );
}
