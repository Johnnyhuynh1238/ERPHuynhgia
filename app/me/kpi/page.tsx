import { redirect } from "next/navigation";
import { UserRole } from "@prisma/client";
import { ProtectedLayout } from "@/components/protected-layout";
import { getCurrentUser } from "@/lib/auth-helpers";
import { MeKpiClient } from "./_components/me-kpi-client";

export default async function MeKpiPage() {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    redirect("/login");
  }

  if (user.role !== UserRole.engineer) {
    redirect("/?denied=1");
  }

  return (
    <ProtectedLayout>
      <MeKpiClient />
    </ProtectedLayout>
  );
}
