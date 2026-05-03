import { redirect } from "next/navigation";
import { UserRole } from "@prisma/client";
import { ProtectedLayout } from "@/components/protected-layout";
import { getCurrentUser } from "@/lib/auth-helpers";
import { ContributionRatingClient } from "./rating-client";

export default async function ContributionRatingPage() {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    redirect("/login");
  }

  if (user.role !== UserRole.construction_manager && user.role !== UserRole.admin) {
    redirect("/?denied=1");
  }

  return (
    <ProtectedLayout>
      <ContributionRatingClient canFinalize={user.role === UserRole.admin} />
    </ProtectedLayout>
  );
}
