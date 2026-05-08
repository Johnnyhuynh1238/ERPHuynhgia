import { redirect } from "next/navigation";
import { UserRole } from "@prisma/client";
import { ProtectedLayout } from "@/components/protected-layout";
import { getCurrentUser } from "@/lib/auth-helpers";
import { TptcAssignmentsClient } from "./tptc-assignments-client";

export default async function TptcAssignmentsPage() {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    redirect("/login");
  }

  if (user.role !== UserRole.construction_manager && user.role !== UserRole.admin) {
    redirect("/?denied=1");
  }

  return (
    <ProtectedLayout>
      <TptcAssignmentsClient canCreate={true} canApprove={true} />
    </ProtectedLayout>
  );
}
