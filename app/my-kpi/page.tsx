import { redirect } from "next/navigation";
import { UserRole } from "@prisma/client";
import { ProtectedLayout } from "@/components/protected-layout";
import { getCurrentUser } from "@/lib/auth-helpers";
import { MyKpiClient } from "./_components/my-kpi-client";

export default async function MyKpiPage() {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    redirect("/login");
  }

  if (user.role !== UserRole.engineer && user.role !== UserRole.construction_manager) {
    redirect("/?denied=1");
  }

  return (
    <ProtectedLayout>
      <MyKpiClient />
    </ProtectedLayout>
  );
}
